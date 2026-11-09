# Email and password

Register, log in, and get back in when the password is forgotten. For people who do not want, or cannot use, Google.

## Register

Validate first, hash the password, then one INSERT. The client can never choose its own role: the column default decides.

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#eaf6fc","primaryBorderColor":"#099bdd","primaryTextColor":"#17324a","lineColor":"#2f6f9f","edgeLabelBackground":"#ffffff","fontSize":"15px"}}}%%
flowchart TD
    s(["POST /auth/register<br/>{ name, email, password }"]) --> v1{"valid email,<br/>name 1 to 100 characters?"}
    v1 -- no --> e400a["400"]
    v1 -- yes --> v2{"password<br/>12 to 128 characters?"}
    v2 -- no --> e400a
    v2 -- yes --> h["Argon2id hash<br/>(slow on purpose, salted)"]
    h --> i["INSERT user<br/>values travel apart from the SQL"]
    i --> u{"email already<br/>in the table?"}
    u -- yes --> e409["409 That email has an account.<br/>Sign in, or use Forgot password."]
    u -- no --> t["issue access and refresh tokens"]
    t --> ok(["201 and the session"])

    classDef good fill:#e6f6ea,stroke:#2e9e57,color:#17324a,stroke-width:2px;
    classDef bad fill:#fdecea,stroke:#d64545,color:#17324a,stroke-width:2px;
    classDef step fill:#eaf6fc,stroke:#099bdd,color:#17324a,stroke-width:2px;
    class ok good;
    class e400a,e409 bad;
    class h,i,t step;
```

## Login: one message for two mistakes

An unknown email and a wrong password look identical, in text and in time.

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#eaf6fc","primaryBorderColor":"#099bdd","primaryTextColor":"#17324a","lineColor":"#2f6f9f","edgeLabelBackground":"#ffffff","fontSize":"15px"}}}%%
flowchart TD
    s(["POST /auth/login<br/>{ email, password }"]) --> q["SELECT the user by email"]
    q --> f{"user found?"}
    f -- yes --> v1["verify the password<br/>against the stored hash"]
    f -- no --> v2["verify against a dummy hash<br/>(same amount of work)"]
    v1 --> m{"matches?"}
    v2 --> m
    m -- no --> e401["401 Wrong email or password.<br/>the same message for both mistakes"]
    m -- yes --> ok(["200 and the session"])

    classDef good fill:#e6f6ea,stroke:#2e9e57,color:#17324a,stroke-width:2px;
    classDef bad fill:#fdecea,stroke:#d64545,color:#17324a,stroke-width:2px;
    class ok good;
    class e401 bad;
```

A Google-only account has no hash, so the password door stays shut for it: it gets the same 401.

## Forgot password: the one-time code

Whoever can read the inbox of the account may set a new password, so the code is treated like a password that exists for 15 minutes.

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#eaf6fc","primaryBorderColor":"#099bdd","primaryTextColor":"#17324a","lineColor":"#2f6f9f","signalColor":"#2f6f9f","signalTextColor":"#2f6f9f","noteBkgColor":"#fff6e0","noteTextColor":"#17324a","actorBkg":"#eaf6fc","actorBorder":"#099bdd","actorTextColor":"#17324a","actorLineColor":"#2f6f9f","fontSize":"15px"}}}%%
sequenceDiagram
    autonumber
    actor U as Person
    participant A as Flutter app
    participant S as Node API
    participant D as PostgreSQL
    participant M as Mailbox

    U->>A: taps "Forgot password?" and enters the email
    A->>S: POST /auth/forgot-password { email }
    S->>D: find the user by email
    opt the email has an account
        S->>S: make 6 random digits (crypto.randomInt)
        S->>D: delete older codes, store the HMAC of the new one
        S--)M: email with the code (not awaited)
    end
    S-->>A: 200 "If an account uses this email, we sent a code" (same for every address)
    M-->>U: the code
    U->>A: types the code and a new password
    A->>S: POST /auth/reset-password { email, code, password }
    S->>D: count the guess, compare, mark the code used
    S->>D: UPDATE password_hash, DELETE all refresh tokens
    S-->>A: 200 Password changed
    A-->>U: back to sign in, with a notice
```

On your own computer there is no mail server: the API prints the email in its log and `./code.sh` shows the newest code. Set `SMTP_URL` in `api/.env` to send real email.

## Checking the code

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#eaf6fc","primaryBorderColor":"#099bdd","primaryTextColor":"#17324a","lineColor":"#2f6f9f","edgeLabelBackground":"#ffffff","fontSize":"15px"}}}%%
flowchart TD
    s(["POST /auth/reset-password<br/>{ email, code, password }"]) --> a{"code is 6 digits,<br/>password 12 to 128 characters?"}
    a -- no --> ref["400 That code is wrong or has expired.<br/>one message for every failure"]
    a -- yes --> b{"user exists?"}
    b -- no --> ref
    b -- yes --> c["count this guess<br/>(one atomic UPDATE)"]
    c --> d{"a live code:<br/>not used, not expired,<br/>fewer than 5 guesses?"}
    d -- no --> ref
    d -- yes --> e{"hash of the typed code<br/>equals the stored hash?<br/>(constant-time compare)"}
    e -- no --> ref
    e -- yes --> f["mark the code used<br/>(atomic: only one request wins)"]
    f --> g["hash the new password,<br/>UPDATE users"]
    g --> h["DELETE every refresh token<br/>of this user"]
    h --> ok(["200 Password changed"])

    classDef good fill:#e6f6ea,stroke:#2e9e57,color:#17324a,stroke-width:2px;
    classDef bad fill:#fdecea,stroke:#d64545,color:#17324a,stroke-width:2px;
    class ok good;
    class ref bad;
```

## Life of a reset code

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#eaf6fc","primaryBorderColor":"#099bdd","primaryTextColor":"#17324a","lineColor":"#2f6f9f","fontSize":"15px"}}}%%
stateDiagram-v2
    [*] --> Live: forgot-password creates it
    Live --> Live: a wrong guess (counted)
    Live --> Used: the right code
    Live --> Locked: 5 guesses used
    Live --> Expired: 15 minutes pass
    Live --> Replaced: a newer code is asked for
    Used --> [*]: works once
    Locked --> [*]
    Expired --> [*]
    Replaced --> [*]
```

## The six rules

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#eaf6fc","primaryBorderColor":"#099bdd","primaryTextColor":"#17324a","lineColor":"#2f6f9f","edgeLabelBackground":"#ffffff","fontSize":"15px"}}}%%
flowchart LR
    core(("Reset code"))
    core --> r1["Hashed<br/>keyed HMAC, never the digits"]
    core --> r2["Short life<br/>15 minutes"]
    core --> r3["One use<br/>marked used atomically"]
    core --> r4["Five guesses<br/>then it is dead"]
    core --> r5["Same answer<br/>for every address"]
    core --> r6["Old sessions end<br/>refresh tokens deleted"]

    classDef box fill:#eaf6fc,stroke:#099bdd,color:#17324a,stroke-width:2px;
    classDef hub fill:#fff6e0,stroke:#e0a100,color:#17324a,stroke-width:2px;
    class r1,r2,r3,r4,r5,r6 box;
    class core hub;
```

Access tokens already issued stay valid until they expire (at most 15 minutes). That is the same honest cost as with logout.
