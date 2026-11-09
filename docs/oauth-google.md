# OAuth and Sign in with Google

The idea first, in a short story. Then the real names, then the real flow in our app.

## OAuth in one story: the archive

A locked archive holds your documents and only you have the key. A courier offers to fetch one document. You do not hand over your key: you ask the envoy, whom everyone trusts, to give the courier a sealed pass for that one document, today only.

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#eaf6fc","primaryBorderColor":"#099bdd","primaryTextColor":"#17324a","lineColor":"#2f6f9f","signalColor":"#2f6f9f","signalTextColor":"#2f6f9f","noteBkgColor":"#fff6e0","noteTextColor":"#17324a","actorBkg":"#eaf6fc","actorBorder":"#099bdd","actorTextColor":"#17324a","actorLineColor":"#2f6f9f","fontSize":"15px"}}}%%
sequenceDiagram
    autonumber
    actor O as You, the archive owner
    participant E as The envoy
    participant C as The courier
    participant K as The archive keeper

    O->>E: this courier may collect one document, today only
    E-->>C: a sealed pass
    C->>K: pass, please: one document
    K->>K: check the seal and the date
    K-->>C: here is the document
    Note over O,K: the courier never held your key, and the keeper never needed to know you
```

## The same story, with real names

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#eaf6fc","primaryBorderColor":"#099bdd","primaryTextColor":"#17324a","lineColor":"#2f6f9f","edgeLabelBackground":"#ffffff","fontSize":"15px"}}}%%
flowchart LR
    subgraph story["In the story"]
        s1["The courier"]
        s2["You, the archive owner"]
        s3["The envoy"]
        s4["The archive and its keeper"]
        s5["The sealed pass"]
        s6["The name tag"]
    end
    subgraph oauth["In OAuth"]
        o1["Client app"]
        o2["User (resource owner)"]
        o3["Authorization server"]
        o4["Resource server (an API)"]
        o5["Access token"]
        o6["ID token (OpenID Connect)"]
    end
    subgraph us["In our project"]
        p1["Flutter app"]
        p2["You, with your Google account"]
        p3["Google"]
        p4["Node.js API"]
        p5["our JWT"]
        p6["Google's signed ID token"]
    end
    s1 --- o1 --- p1
    s2 --- o2 --- p2
    s3 --- o3 --- p3
    s4 --- o4 --- p4
    s5 --- o5 --- p5
    s6 --- o6 --- p6

    classDef a fill:#eaf6fc,stroke:#099bdd,color:#17324a;
    classDef b fill:#fff6e0,stroke:#e0a100,color:#17324a;
    classDef c fill:#e6f6ea,stroke:#2e9e57,color:#17324a;
    class s1,s2,s3,s4,s5,s6 a;
    class o1,o2,o3,o4,o5,o6 b;
    class p1,p2,p3,p4,p5,p6 c;
```

## The OAuth roles

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#eaf6fc","primaryBorderColor":"#099bdd","primaryTextColor":"#17324a","lineColor":"#2f6f9f","edgeLabelBackground":"#ffffff","fontSize":"15px"}}}%%
flowchart LR
    user(("User<br/>resource owner"))
    client["Client app<br/>Flutter"]
    authz["Authorization server<br/>Google"]
    resource["Resource server<br/>our Node API"]

    user -- "1 allows the request" --> authz
    client -- "asks for access" --> authz
    authz -- "2 token" --> client
    client -- "3 shows the token" --> resource
    resource -- "4 checks the token" --> authz
    resource -- "5 answers" --> client

    classDef box fill:#eaf6fc,stroke:#099bdd,color:#17324a,stroke-width:2px;
    class user,client,authz,resource box;
```

Four protections come with every token: the password stays with Google, the token has a **scope** (only what was allowed), an **expiry**, and it can be **revoked**.

## Access token and ID token

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#eaf6fc","primaryBorderColor":"#099bdd","primaryTextColor":"#17324a","lineColor":"#2f6f9f","edgeLabelBackground":"#ffffff","fontSize":"15px"}}}%%
flowchart LR
    q1{"What does the app want to know?"}
    q1 -- "who is this person?" --> idt["<b>ID token</b><br/>OpenID Connect<br/>a signed name tag<br/>audience: our client ID"]
    q1 -- "may I use this API?" --> acc["<b>Access token</b><br/>OAuth<br/>a pass for the API<br/>scope and expiry"]
    idt --> use1["our API verifies it once<br/>then issues its own tokens"]
    acc --> use2["our own JWT<br/>is the access token of our API"]

    classDef box fill:#eaf6fc,stroke:#099bdd,color:#17324a,stroke-width:2px;
    class idt,acc,use1,use2 box;
```

## Sign in with Google, step by step

Google proves who the person is **once**. After that, our own tokens carry the session.

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#eaf6fc","primaryBorderColor":"#099bdd","primaryTextColor":"#17324a","lineColor":"#2f6f9f","signalColor":"#2f6f9f","signalTextColor":"#2f6f9f","noteBkgColor":"#fff6e0","noteTextColor":"#17324a","actorBkg":"#eaf6fc","actorBorder":"#099bdd","actorTextColor":"#17324a","actorLineColor":"#2f6f9f","fontSize":"15px"}}}%%
sequenceDiagram
    autonumber
    actor U as User
    participant A as Flutter app
    participant G as Google
    participant S as Node API
    participant D as PostgreSQL

    U->>A: taps "Sign in with Google"
    A->>G: authenticate() with serverClientId (our web client ID)
    G->>U: Google's own window: choose an account
    U-->>G: picks an account
    G-->>A: ID token, signed by Google
    A->>S: POST /auth/google { idToken }
    S->>S: verify signature, issuer, audience, expiry, email_verified
    S->>D: find the user by google_sub
    alt known person
        D-->>S: the user
    else first time
        S->>D: INSERT user (email, name, google_sub), no password
    end
    S-->>A: our access token and refresh token
    Note over A,S: from here on, a Google user and a password user hold the same kind of tokens
```

## What the server checks on the ID token

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#eaf6fc","primaryBorderColor":"#099bdd","primaryTextColor":"#17324a","lineColor":"#2f6f9f","edgeLabelBackground":"#ffffff","fontSize":"15px"}}}%%
flowchart TD
    t(["POST /auth/google<br/>{ idToken }"]) --> c0{"GOOGLE_CLIENT_IDS<br/>configured?"}
    c0 -- no --> e503["503 not configured"]
    c0 -- yes --> c1{"token looks like<br/>a string of sane size?"}
    c1 -- no --> e400["400"]
    c1 -- yes --> c2{"Google's signature,<br/>issuer and expiry valid?"}
    c2 -- no --> e401["401"]
    c2 -- yes --> c3{"audience is one<br/>of OUR client IDs?"}
    c3 -- no --> e401
    c3 -- yes --> c4{"email present and<br/>email_verified is true?"}
    c4 -- no --> e401
    c4 -- yes --> ok(["trusted: identity = the sub claim"])

    classDef good fill:#e6f6ea,stroke:#2e9e57,color:#17324a,stroke-width:2px;
    classDef bad fill:#fdecea,stroke:#d64545,color:#17324a,stroke-width:2px;
    class ok good;
    class e503,e400,e401 bad;
```

The audience check matters: a token that Google issued to a **different** app proves nothing about someone signing in to ours.

## Why the app never decides who the user is

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#eaf6fc","primaryBorderColor":"#099bdd","primaryTextColor":"#17324a","lineColor":"#2f6f9f","signalColor":"#2f6f9f","signalTextColor":"#2f6f9f","noteBkgColor":"#fff6e0","noteTextColor":"#17324a","actorBkg":"#eaf6fc","actorBorder":"#099bdd","actorTextColor":"#17324a","actorLineColor":"#2f6f9f","fontSize":"15px"}}}%%
sequenceDiagram
    autonumber
    actor M as Modified app
    participant S as Node API

    M->>S: POST /auth/google { email: "someone@example.com" }
    S-->>M: 400, the ID token is required
    M->>S: POST /auth/google { idToken: a forged token }
    S->>S: the signature does not match Google's keys
    S-->>M: 401 Google did not accept this token
    Note over M,S: only the signed token is proof. The email and name come from it, never from the request
```

## The Google Cloud setup, in four stops

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#eaf6fc","primaryBorderColor":"#099bdd","primaryTextColor":"#17324a","lineColor":"#2f6f9f","edgeLabelBackground":"#ffffff","fontSize":"15px"}}}%%
flowchart LR
    p["<b>1 Project</b><br/>the container for everything"] --> c["<b>2 Consent screen</b><br/>External, Testing,<br/>test users"]
    c --> w["<b>3 Web OAuth client</b><br/>public client ID,<br/>authorized origins"]
    w --> e["<b>4 Use the client ID</b><br/>api/.env GOOGLE_CLIENT_IDS<br/>and --dart-define in the app"]
    w -.-> an["<b>Android client</b><br/>package + SHA-1<br/>of the signing key"]
    an -.-> e

    classDef box fill:#eaf6fc,stroke:#099bdd,color:#17324a,stroke-width:2px;
    class p,c,w,e,an box;
```
