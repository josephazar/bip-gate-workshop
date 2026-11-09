# The Flutter app

The app holds the pass and shows it. It has no secrets and makes no decisions: the server decides.

## Layers

Three folders, one idea per file. Screens show state and call services; services call the API; models describe what the API sends.

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#eaf6fc","primaryBorderColor":"#099bdd","primaryTextColor":"#17324a","lineColor":"#2f6f9f","edgeLabelBackground":"#ffffff","fontSize":"15px"}}}%%
flowchart TB
    subgraph screens["screens/ (what the user sees)"]
        sp["splash"]
        lg["login"]
        rg["register"]
        fp["forgot password"]
        rs["new password"]
        hm["home"]
    end
    subgraph services["services/ (the work)"]
        api["api_service<br/>every call to the API"]
        sm["session_manager<br/>the two tokens, who is signed in"]
        gs["google_service<br/>Google's window, ID token"]
    end
    subgraph models["models/"]
        m1["user"]
        m2["auth_session"]
        m3["access_token_claims"]
    end
    main["main.dart<br/>the AuthGate: which screen to show"]

    main --> screens
    screens --> services
    services --> models
    api --> sm
    api -- "HTTP + JSON" --> net(["Node API"])
    gs -- "ID token" --> google(["Google"])

    classDef box fill:#eaf6fc,stroke:#099bdd,color:#17324a,stroke-width:1px;
    classDef ext fill:#fff6e0,stroke:#e0a100,color:#17324a,stroke-width:2px;
    class sp,lg,rg,fp,rs,hm,api,sm,gs,m1,m2,m3,main box;
    class net,google ext;
```

## Which screen to show

The AuthGate in `main.dart` looks only at the session. Nothing else decides.

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#eaf6fc","primaryBorderColor":"#099bdd","primaryTextColor":"#17324a","lineColor":"#2f6f9f","fontSize":"15px"}}}%%
stateDiagram-v2
    [*] --> Loading: app starts, restoreSession()
    Loading --> SignedIn: a stored refresh token buys a new session
    Loading --> SignedOut: no token, or the server refused it
    SignedOut --> SignedIn: login, register, Google
    SignedIn --> SignedOut: logout, or a refresh is refused (401)
    SignedIn --> SignedIn: refresh keeps the session alive

    state Loading { [*] --> splash_screen }
    state SignedOut { [*] --> login_screen }
    state SignedIn { [*] --> home_screen }
```

## Screens and how they connect

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#eaf6fc","primaryBorderColor":"#099bdd","primaryTextColor":"#17324a","lineColor":"#2f6f9f","edgeLabelBackground":"#ffffff","fontSize":"15px"}}}%%
flowchart LR
    login["<b>Sign in</b><br/>email, password,<br/>Google button"]
    reg["<b>Create an account</b><br/>name, email, password"]
    forgot["<b>Forgot password</b><br/>email"]
    reset["<b>New password</b><br/>6-digit code, new password"]
    home["<b>Home</b><br/>card, decoded token,<br/>GET /me, admin, refresh,<br/>Link Google, sign out"]

    login -- "Create an account" --> reg
    login -- "Forgot password?" --> forgot
    forgot -- "Send me a code" --> reset
    reset -- "password changed:<br/>back to login with a notice" --> login
    login -- "sign in works" --> home
    reg -- "account created" --> home
    home -- "Sign out" --> login

    classDef box fill:#eaf6fc,stroke:#099bdd,color:#17324a,stroke-width:2px;
    class login,reg,forgot,reset,home box;
```

## Starting the app: restore the session

The access token lives in memory only, so it is gone when the app closes. The refresh token waits in secure storage (Android Keystore, iOS Keychain).

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#eaf6fc","primaryBorderColor":"#099bdd","primaryTextColor":"#17324a","lineColor":"#2f6f9f","signalColor":"#2f6f9f","signalTextColor":"#2f6f9f","noteBkgColor":"#fff6e0","noteTextColor":"#17324a","actorBkg":"#eaf6fc","actorBorder":"#099bdd","actorTextColor":"#17324a","actorLineColor":"#2f6f9f","fontSize":"15px"}}}%%
sequenceDiagram
    autonumber
    participant UI as AuthGate
    participant API as ApiService
    participant SS as Secure storage
    participant S as Node API

    UI->>API: restoreSession()
    API->>SS: read the refresh token
    alt nothing stored
        SS-->>API: none
        API-->>UI: SignedOut, show login
    else a token is stored
        SS-->>API: refresh token
        API->>S: POST /auth/refresh
        alt accepted
            S-->>API: new access token and new refresh token
            API->>SS: store the new refresh token
            API-->>UI: SignedIn, show home
        else refused (401)
            S-->>API: 401
            API-->>UI: SignedOut with "Your session ended"
        else server unreachable
            API-->>UI: SignedOut, but the token is kept for next time
        end
    end
```

## One refresh at a time

Several calls can fail at the same moment with an expired access token. They share one refresh request, then each retries once.

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#eaf6fc","primaryBorderColor":"#099bdd","primaryTextColor":"#17324a","lineColor":"#2f6f9f","signalColor":"#2f6f9f","signalTextColor":"#2f6f9f","noteBkgColor":"#fff6e0","noteTextColor":"#17324a","actorBkg":"#eaf6fc","actorBorder":"#099bdd","actorTextColor":"#17324a","actorLineColor":"#2f6f9f","fontSize":"15px"}}}%%
sequenceDiagram
    autonumber
    participant C1 as Call 1 (GET /me)
    participant C2 as Call 2 (GET /admin/users)
    participant API as ApiService
    participant S as Node API

    C1->>S: request with an expired token
    C2->>S: request with an expired token
    S-->>C1: 401
    S-->>C2: 401
    C1->>API: refresh needed
    C2->>API: refresh needed
    Note over API: one shared Future: only ONE refresh request is sent
    API->>S: POST /auth/refresh
    S-->>API: new pair
    API-->>C1: done
    API-->>C2: done
    C1->>S: retry once with the new token
    C2->>S: retry once with the new token
```

## Sign in with Google (Flutter side)

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#eaf6fc","primaryBorderColor":"#099bdd","primaryTextColor":"#17324a","lineColor":"#2f6f9f","edgeLabelBackground":"#ffffff","fontSize":"15px"}}}%%
flowchart LR
    b["Sign in with Google<br/>button"] --> cfg{"GOOGLE_WEB_CLIENT_ID<br/>given with --dart-define?"}
    cfg -- no --> off["button disabled:<br/>Google sign-in is not configured"]
    cfg -- yes --> init["GoogleSignIn.initialize<br/>(serverClientId)"]
    init --> auth["authenticate()<br/>Google's own window"]
    auth --> tok{"ID token<br/>returned?"}
    tok -- "window closed" --> stay["stay on the login screen"]
    tok -- yes --> post["POST /auth/google<br/>to OUR server"]
    post --> sess["the session manager<br/>saves our tokens"]

    classDef box fill:#eaf6fc,stroke:#099bdd,color:#17324a,stroke-width:2px;
    classDef soft fill:#ffffff,stroke:#2f6f9f,color:#17324a;
    class b,init,auth,post,sess box;
    class off,stay soft;
```

## Talking to the emulator's host

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#eaf6fc","primaryBorderColor":"#099bdd","primaryTextColor":"#17324a","lineColor":"#2f6f9f","edgeLabelBackground":"#ffffff","fontSize":"15px"}}}%%
flowchart LR
    app["app on the emulator<br/>localhost = the emulator itself"] -- "http://10.0.2.2:3220" --> host["your computer<br/>the API listens on 127.0.0.1:3220"]
    app -. "needs the INTERNET permission<br/>and cleartext http only in debug builds" .-> host

    classDef box fill:#eaf6fc,stroke:#099bdd,color:#17324a,stroke-width:2px;
    class app,host box;
```
