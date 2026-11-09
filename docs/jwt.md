# JWT and sessions

How the pass works: what is inside it, how the server seals and checks it, and how a session stays alive.

## What a JWT is

Three parts, separated by dots. The first two are only **encoded**: anyone can read them. The third is a **signature** that only the server can make.

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#eaf6fc","primaryBorderColor":"#099bdd","primaryTextColor":"#17324a","lineColor":"#2f6f9f","edgeLabelBackground":"#ffffff","fontSize":"15px"}}}%%
flowchart LR
    h["<b>Header</b><br/>alg HS256, typ JWT"] --> enc1["Base64URL"]
    p["<b>Payload (claims)</b><br/>sub, role, iss, aud, iat, exp"] --> enc2["Base64URL"]
    enc1 --> join(["header . payload"])
    enc2 --> join
    join --> hmac{{"HMAC-SHA256<br/>with JWT_SECRET"}}
    hmac --> sig["<b>Signature</b>"]
    join --> token(["<b>token</b><br/>header.payload.signature"])
    sig --> token

    classDef box fill:#eaf6fc,stroke:#099bdd,color:#17324a,stroke-width:2px;
    classDef secret fill:#fff6e0,stroke:#e0a100,color:#17324a,stroke-width:2px;
    class h,p,enc1,enc2,join,sig,token box;
    class hmac secret;
```

| Claim | Meaning | Our value |
|---|---|---|
| `sub` | who the token is about | the user's id |
| `role` | a convenience copy of the role | `user` or `admin` (the server never trusts it) |
| `iss` | who issued it | `bip-gate` |
| `aud` | who it is for | `bip-gate-api` |
| `iat`, `exp` | issued at, expires at | 15 minutes apart |

## Sign at login, verify on every request

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#eaf6fc","primaryBorderColor":"#099bdd","primaryTextColor":"#17324a","lineColor":"#2f6f9f","signalColor":"#2f6f9f","signalTextColor":"#2f6f9f","noteBkgColor":"#fff6e0","noteTextColor":"#17324a","actorBkg":"#eaf6fc","actorBorder":"#099bdd","actorTextColor":"#17324a","actorLineColor":"#2f6f9f","fontSize":"15px"}}}%%
sequenceDiagram
    autonumber
    participant A as Flutter app
    participant S as Node API
    participant D as PostgreSQL

    A->>S: POST /auth/login (email, password)
    S->>D: SELECT the user by email
    D-->>S: row with password_hash
    S->>S: Argon2id verify
    S->>S: jwt.sign(role) with sub, iss, aud, exp
    S-->>A: access token (15 min) and refresh token

    Note over A,S: later, on every protected call
    A->>S: GET /me with "Authorization: Bearer token"
    S->>S: jwt.verify (signature, algorithm, iss, aud, exp)
    S->>D: SELECT the user by sub
    D-->>S: current row, with the real role
    S-->>A: 200 and the user
```

## What verify checks

One call checks everything at once. The token does not get to choose its own algorithm: the server decides.

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#eaf6fc","primaryBorderColor":"#099bdd","primaryTextColor":"#17324a","lineColor":"#2f6f9f","edgeLabelBackground":"#ffffff","fontSize":"15px"}}}%%
flowchart TD
    t(["token arrives"]) --> a{"signature matches<br/>JWT_SECRET?"}
    a -- no --> x["401"]
    a -- yes --> b{"algorithm is HS256?<br/>(not none, not RS256)"}
    b -- no --> x
    b -- yes --> c{"issuer is bip-gate?"}
    c -- no --> x
    c -- yes --> d{"audience is bip-gate-api?"}
    d -- no --> x
    d -- yes --> e{"not expired?"}
    e -- no --> x
    e -- yes --> ok(["claims accepted"])

    classDef good fill:#e6f6ea,stroke:#2e9e57,color:#17324a,stroke-width:2px;
    classDef bad fill:#fdecea,stroke:#d64545,color:#17324a,stroke-width:2px;
    class ok good;
    class x bad;
```

## Change one claim, break the seal

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#eaf6fc","primaryBorderColor":"#099bdd","primaryTextColor":"#17324a","lineColor":"#2f6f9f","signalColor":"#2f6f9f","signalTextColor":"#2f6f9f","noteBkgColor":"#fff6e0","noteTextColor":"#17324a","actorBkg":"#eaf6fc","actorBorder":"#099bdd","actorTextColor":"#17324a","actorLineColor":"#2f6f9f","fontSize":"15px"}}}%%
sequenceDiagram
    autonumber
    actor U as Attacker
    participant S as Node API

    U->>U: decode the payload (it is readable)
    U->>U: change role=user to role=admin
    U->>U: keep the old signature (the secret is unknown)
    U->>S: GET /admin/users with the edited token
    S->>S: recompute the HMAC over header.payload
    S-->>U: 401, the signature no longer matches
    Note over U,S: and even a valid token only gets 403 if the database says role=user
```

## The keeper: 401 and 403

Two different refusals. **401**: the keeper does not know who you are. **403**: the keeper knows exactly who you are, and the answer is still no.

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#eaf6fc","primaryBorderColor":"#099bdd","primaryTextColor":"#17324a","lineColor":"#2f6f9f","edgeLabelBackground":"#ffffff","fontSize":"15px"}}}%%
flowchart TD
    r(["protected request"]) --> a{"Authorization: Bearer ... present?"}
    a -- no --> e401["401 Sign in first"]
    a -- yes --> b{"token valid<br/>and not expired?"}
    b -- no --> e401
    b -- yes --> c{"user still exists<br/>in the database?"}
    c -- no --> e401
    c -- yes --> d{"route needs a role?<br/>does the DATABASE role match?"}
    d -- no --> e403["403 Signed in, but not allowed"]
    d -- yes --> ok(["200 the route runs"])

    classDef good fill:#e6f6ea,stroke:#2e9e57,color:#17324a,stroke-width:2px;
    classDef bad fill:#fdecea,stroke:#d64545,color:#17324a,stroke-width:2px;
    class ok good;
    class e401,e403 bad;
```

## Two tokens, two jobs

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#eaf6fc","primaryBorderColor":"#099bdd","primaryTextColor":"#17324a","lineColor":"#2f6f9f","edgeLabelBackground":"#ffffff","fontSize":"15px"}}}%%
flowchart LR
    subgraph access["Access token"]
        a1["a signed JWT"] --- a2["lives 15 minutes"] --- a3["sent with every request"] --- a4["kept in memory only"]
    end
    subgraph refresh["Refresh token"]
        r1["32 random bytes"] --- r2["lives up to 7 days"] --- r3["only buys a new pair"] --- r4["kept in secure storage<br/>(stored hashed on the server)"]
    end
    access -. "expires" .-> refresh

    classDef box fill:#eaf6fc,stroke:#099bdd,color:#17324a,stroke-width:1px;
    class a1,a2,a3,a4,r1,r2,r3,r4 box;
```

## Refresh token rotation

Each refresh token works exactly once. A new access token comes with a new refresh token.

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#eaf6fc","primaryBorderColor":"#099bdd","primaryTextColor":"#17324a","lineColor":"#2f6f9f","signalColor":"#2f6f9f","signalTextColor":"#2f6f9f","noteBkgColor":"#fff6e0","noteTextColor":"#17324a","actorBkg":"#eaf6fc","actorBorder":"#099bdd","actorTextColor":"#17324a","actorLineColor":"#2f6f9f","fontSize":"15px"}}}%%
sequenceDiagram
    autonumber
    participant A as Flutter app
    participant S as Node API
    participant D as PostgreSQL

    A->>S: GET /me with an expired access token
    S-->>A: 401
    A->>S: POST /auth/refresh with refresh token R1
    S->>D: UPDATE ... SET used_at = now()<br/>WHERE hash = sha256(R1) AND used_at IS NULL AND not expired
    D-->>S: 1 row (only one request can win)
    S->>D: INSERT refresh token R2 (same 7-day limit)
    S-->>A: new access token and R2
    A->>S: GET /me again, with the new access token
    S-->>A: 200
```

## A spent token comes back

If an already-used refresh token is shown again, a copy was stolen. We sign the person out everywhere.

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#eaf6fc","primaryBorderColor":"#099bdd","primaryTextColor":"#17324a","lineColor":"#2f6f9f","signalColor":"#2f6f9f","signalTextColor":"#2f6f9f","noteBkgColor":"#fff6e0","noteTextColor":"#17324a","actorBkg":"#eaf6fc","actorBorder":"#099bdd","actorTextColor":"#17324a","actorLineColor":"#2f6f9f","fontSize":"15px"}}}%%
sequenceDiagram
    autonumber
    actor T as Thief
    participant S as Node API
    participant D as PostgreSQL
    actor O as Owner

    O->>S: refresh with R1
    S-->>O: new pair, R1 is now used
    T->>S: refresh with the stolen copy of R1
    S->>D: the UPDATE matches no unused row
    S->>D: R1 is known and already used?
    D-->>S: yes
    S->>D: DELETE every refresh token of this user
    S-->>T: 401
    Note over O,T: the owner's next refresh also fails, so both must sign in again
```

## Life of a refresh token

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#eaf6fc","primaryBorderColor":"#099bdd","primaryTextColor":"#17324a","lineColor":"#2f6f9f","fontSize":"15px"}}}%%
stateDiagram-v2
    [*] --> Issued: login, register, Google, or a refresh
    Issued --> Used: exchanged once
    Issued --> Expired: 7 days after the first sign-in
    Issued --> Deleted: logout
    Used --> Deleted: shown again (replay)
    Issued --> Deleted: password reset, or a replay elsewhere
    Used --> [*]
    Expired --> [*]
    Deleted --> [*]
```

## What logout cannot do

Logout deletes the refresh token on the server and the app forgets its copy. The access token already issued lives until it expires (at most 15 minutes): that is the price of a pass the server does not look up. A sessions table would make revocation immediate.
