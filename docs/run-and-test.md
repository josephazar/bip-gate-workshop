# Run it and test it

One script starts everything, one script puts it out.

## What start.sh does

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#eaf6fc","primaryBorderColor":"#099bdd","primaryTextColor":"#17324a","lineColor":"#2f6f9f","edgeLabelBackground":"#ffffff","fontSize":"15px"}}}%%
flowchart TD
    s(["./start.sh"]) --> t1{"Node 22+, npm, psql,<br/>pg_isready found?"}
    t1 -- no --> stop1["STOP with a clear message"]
    t1 -- yes --> t2{"PostgreSQL accepting<br/>connections?"}
    t2 -- no --> stop1
    t2 -- yes --> env["create api/.env with a fresh<br/>JWT_SECRET, only if it is missing"]
    env --> db["create the database bip_gate if needed<br/>(never drops anything)"]
    db --> npm["npm ci, only if node_modules is missing"]
    npm --> api{"API already<br/>answering on 3220?"}
    api -- yes --> reuse["reuse it"]
    api -- no --> startapi["start the API in the background<br/>run database/*.sql in order"]
    reuse --> emu
    startapi --> emu["boot the Android emulator<br/>and wait until it is ready"]
    emu --> app["flutter run with API_URL and<br/>GOOGLE_WEB_CLIENT_ID"]
    app --> keys(["hot reload: r, R, q"])

    classDef good fill:#e6f6ea,stroke:#2e9e57,color:#17324a,stroke-width:2px;
    classDef bad fill:#fdecea,stroke:#d64545,color:#17324a,stroke-width:2px;
    classDef step fill:#eaf6fc,stroke:#099bdd,color:#17324a,stroke-width:2px;
    class keys good;
    class stop1 bad;
    class env,db,npm,startapi,emu,app,reuse step;
```

`./stop.sh` stops the app, the API and the emulator that `start.sh` opened. It never touches PostgreSQL.
`./code.sh` prints the newest forgot-password code, because the API prints the email in its log.

## Try the whole system

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#eaf6fc","primaryBorderColor":"#099bdd","primaryTextColor":"#17324a","lineColor":"#2f6f9f","edgeLabelBackground":"#ffffff","fontSize":"15px"}}}%%
flowchart LR
    a["Register in the app"] --> b["Sign out, sign in"]
    b --> c["Wrong password:<br/>one message"]
    c --> d["Call GET /me: 200<br/>Admin route: 403"]
    d --> e["npm run promote<br/>admin route: 200"]
    e --> f["Close and reopen:<br/>still signed in"]
    f --> g["Refresh token now"]
    g --> h["Forgot password:<br/>./code.sh, new password"]
    h --> i["Sign in with Google,<br/>Link Google account"]

    classDef box fill:#eaf6fc,stroke:#099bdd,color:#17324a,stroke-width:2px;
    class a,b,c,d,e,f,g,h,i box;
```

## What the tests try

The tests run on their own database, never your real one. They try the doors the wrong way.

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#eaf6fc","primaryBorderColor":"#099bdd","primaryTextColor":"#17324a","lineColor":"#2f6f9f","edgeLabelBackground":"#ffffff","fontSize":"15px"}}}%%
flowchart LR
    t(("npm test<br/>flutter test"))
    t --> a["Tokens<br/>forged, expired, altered,<br/>wrong algorithm, wrong audience"]
    t --> b["Roles<br/>401 versus 403,<br/>role read from the database"]
    t --> c["Refresh<br/>rotation, replay, logout,<br/>absolute lifetime, a race"]
    t --> d["Google<br/>verified email only,<br/>subject, no merge on email, link"]
    t --> e["Reset codes<br/>one use, expiry, five guesses,<br/>same answer, sessions end"]
    t --> f["App<br/>errors, one refresh,<br/>forgot password screens"]

    classDef box fill:#eaf6fc,stroke:#099bdd,color:#17324a,stroke-width:2px;
    classDef hub fill:#fff6e0,stroke:#e0a100,color:#17324a,stroke-width:2px;
    class a,b,c,d,e,f box;
    class t hub;
```

```sh
createdb bip_gate_qa
cd api    && DATABASE_URL=postgres://localhost/bip_gate_qa npm test
cd client && flutter analyze && flutter test
```
