# Architecture

The whole system in a few pictures. Every diagram here is drawn from the real code in this repository.

## The three boxes

One rule: **the app asks, the server decides.** The app holds a pass and shows it; only the API and the database decide who may do what.

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#eaf6fc","primaryBorderColor":"#099bdd","primaryTextColor":"#17324a","lineColor":"#2f6f9f","secondaryColor":"#fff6e0","tertiaryColor":"#ffffff","edgeLabelBackground":"#ffffff","fontSize":"15px"}}}%%
flowchart LR
    subgraph phone["Android emulator"]
        app["<b>Flutter app</b><br/>screens, services, models"]
    end
    subgraph pc["Your computer"]
        api["<b>Node.js + Express API</b><br/>port 3220"]
        db[("<b>PostgreSQL</b><br/>database bip_gate")]
    end
    google["<b>Google</b><br/>authorization server"]

    app -- "JSON over HTTP<br/>(10.0.2.2 from the emulator)" --> api
    api -- "SQL" --> db
    app -- "Google's own sign-in window" --> google
    google -. "ID token" .-> app
    api -- "checks the token<br/>with Google's public keys" --> google

    classDef box fill:#eaf6fc,stroke:#099bdd,color:#17324a,stroke-width:2px;
    classDef ext fill:#fff6e0,stroke:#e0a100,color:#17324a,stroke-width:2px;
    class app,api,db box;
    class google ext;
```

## The nine steps

Top-down: the plan first, then the database, then the API, then the app. Every step ends with something you run.

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#eaf6fc","primaryBorderColor":"#099bdd","primaryTextColor":"#17324a","lineColor":"#2f6f9f","edgeLabelBackground":"#ffffff","fontSize":"15px"}}}%%
flowchart TB
    s1["<b>1 Tables</b><br/>database/01_users.sql"] --> s2["<b>2 API skeleton</b><br/>Express, config, /healthz"]
    s2 --> s3["<b>3 Register</b><br/>Argon2id hash, INSERT"]
    s3 --> s4["<b>4 Login and JWT</b><br/>sign and verify the pass"]
    s4 --> s5["<b>5 The keeper</b><br/>requireAuth: 401 and 403"]
    s5 --> s6["<b>6 Stay signed in</b><br/>refresh tokens, forgot password"]
    s6 --> s7["<b>7 Google</b><br/>ID token, linking"]
    s7 --> s8["<b>8 Flutter app</b><br/>models, services, screens"]
    s8 --> s9["<b>9 One script</b><br/>start.sh, stop.sh, tests"]

    classDef step fill:#eaf6fc,stroke:#099bdd,color:#17324a,stroke-width:2px;
    class s1,s2,s3,s4,s5,s6,s7,s8,s9 step;
```

## Inside the API

Small files, one job each. A request travels from the top to the bottom and back.

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#eaf6fc","primaryBorderColor":"#099bdd","primaryTextColor":"#17324a","lineColor":"#2f6f9f","edgeLabelBackground":"#ffffff","fontSize":"15px"}}}%%
flowchart TB
    req(["HTTP request"]) --> server["<b>server.js</b><br/>starts the listener, prepares the database"]
    server --> app["<b>app.js</b><br/>helmet headers, JSON body, no-store on /auth"]
    app --> routes["<b>routes/</b><br/>auth.js (the doors), me.js (protected pages)"]
    routes --> mw["<b>middleware/requireAuth.js</b><br/>the keeper: token, user, role"]
    routes --> lib["<b>lib/</b><br/>passwords, tokens, google,<br/>reset-codes, mailer, users"]
    mw --> lib
    lib --> dbjs["<b>db.js</b><br/>one connection pool"]
    dbjs --> pg[("PostgreSQL")]
    app -. "any error" .-> err["last stop: a clear message,<br/>never a stack trace"]

    classDef box fill:#eaf6fc,stroke:#099bdd,color:#17324a,stroke-width:2px;
    classDef soft fill:#ffffff,stroke:#2f6f9f,color:#17324a;
    class server,app,routes,mw,lib,dbjs box;
    class req,pg,err soft;
```

## Data model

Three tables. Nothing secret is stored in clear text: passwords and tokens are hashes.

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#eaf6fc","primaryBorderColor":"#099bdd","primaryTextColor":"#17324a","lineColor":"#2f6f9f","fontSize":"14px"}}}%%
erDiagram
    USERS ||--o{ REFRESH_TOKENS : "has sessions"
    USERS ||--o{ PASSWORD_RESET_CODES : "may ask for a code"

    USERS {
        uuid id PK
        text email UK "one account per email"
        text name
        text password_hash "Argon2id, empty for Google-only"
        text google_sub UK "Google subject, empty for password-only"
        text role "user or admin"
        timestamptz created_at
    }
    REFRESH_TOKENS {
        uuid id PK
        uuid user_id FK
        text token_hash UK "SHA-256, never the token"
        timestamptz expires_at "absolute, 7 days"
        timestamptz used_at "set when exchanged"
    }
    PASSWORD_RESET_CODES {
        uuid id PK
        uuid user_id FK
        text code_hash "keyed hash of 6 digits"
        timestamptz expires_at "15 minutes"
        int attempts "guesses so far"
        timestamptz used_at "set when accepted"
    }
```

A database rule keeps every user reachable: a row must have a password hash, a Google subject, or both (`has_a_sign_in_method`).

## What lives where

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#eaf6fc","primaryBorderColor":"#099bdd","primaryTextColor":"#17324a","lineColor":"#2f6f9f","edgeLabelBackground":"#ffffff","fontSize":"15px"}}}%%
flowchart LR
    root["gate-workshop/"] --> d["<b>database/</b><br/>01_users.sql<br/>02_refresh_tokens.sql<br/>03_password_reset_codes.sql"]
    root --> a["<b>api/</b><br/>src/ (server, app, routes, lib)<br/>scripts/ (setup-db, promote, decode-jwt)<br/>test/"]
    root --> c["<b>client/</b><br/>lib/ (models, services, screens)<br/>test/"]
    root --> sh["<b>start.sh · stop.sh · code.sh</b>"]
    root --> doc["<b>docs/</b><br/>these diagrams"]

    classDef box fill:#eaf6fc,stroke:#099bdd,color:#17324a,stroke-width:2px;
    class d,a,c,sh,doc box;
```
