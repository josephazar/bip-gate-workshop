# One person, two doors

What happens when the same person arrives by both doors: once with a password, once with Google.

**The rules:** one email, one account. A Google user is found by Google's subject (`google_sub`). The two doors are joined only with proof of both, and **never because two emails look the same**.

## Who arrives how

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#eaf6fc","primaryBorderColor":"#099bdd","primaryTextColor":"#17324a","lineColor":"#2f6f9f","edgeLabelBackground":"#ffffff","fontSize":"15px"}}}%%
flowchart TD
    start(["Someone arrives"]) --> how{"How?"}

    how -- "Sign in with Google" --> g1{"known google_sub?"}
    g1 -- yes --> okg(["signed in"])
    g1 -- no --> g2{"same email<br/>already in users?"}
    g2 -- no --> g3["create the account<br/>(google_sub, no password)"] --> okg
    g2 -- yes --> g4["409 This email already has a password account.<br/>Sign in with your password, then tap Link Google account."]

    how -- "Register with a password" --> r1{"email already<br/>in users?"}
    r1 -- no --> okr(["account created, signed in"])
    r1 -- yes --> r2["409 That email has an account.<br/>Sign in, or use Forgot password."]

    how -- "Log in with a password" --> l1{"user has<br/>a password hash?"}
    l1 -- yes --> okl(["checked like any login"])
    l1 -- no --> l2["401 Wrong email or password<br/>(a Google-only account has no password yet)"]

    classDef good fill:#e6f6ea,stroke:#2e9e57,color:#17324a,stroke-width:2px;
    classDef bad fill:#fdecea,stroke:#d64545,color:#17324a,stroke-width:2px;
    classDef step fill:#eaf6fc,stroke:#099bdd,color:#17324a,stroke-width:2px;
    class okg,okr,okl good;
    class g4,r2,l2 bad;
    class g3 step;
```

## Ways in, and how an account gets a second one

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#eaf6fc","primaryBorderColor":"#099bdd","primaryTextColor":"#17324a","lineColor":"#2f6f9f","fontSize":"15px"}}}%%
stateDiagram-v2
    [*] --> PasswordOnly: register
    [*] --> GoogleOnly: first Google sign-in
    PasswordOnly --> Both: sign in, then Link Google account
    GoogleOnly --> Both: Forgot password, the emailed code sets a password
    Both --> Both: either door opens the same account
```

The home screen of the app shows the ways in: `password`, `google`, or both.

## Password first, then Google: link it

The person proves the password (they hold a session) **and** Google (the token). Only then is `google_sub` written on that account.

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#eaf6fc","primaryBorderColor":"#099bdd","primaryTextColor":"#17324a","lineColor":"#2f6f9f","signalColor":"#2f6f9f","signalTextColor":"#2f6f9f","noteBkgColor":"#fff6e0","noteTextColor":"#17324a","actorBkg":"#eaf6fc","actorBorder":"#099bdd","actorTextColor":"#17324a","actorLineColor":"#2f6f9f","fontSize":"15px"}}}%%
sequenceDiagram
    autonumber
    actor U as Person
    participant A as Flutter app
    participant G as Google
    participant S as Node API
    participant D as PostgreSQL

    U->>A: taps "Sign in with Google" (same email as the password account)
    A->>S: POST /auth/google { idToken }
    S-->>A: 409 "This email already has a password account. Sign in with your password, then tap Link Google account."
    U->>A: signs in with email and password
    A->>S: POST /auth/login
    S-->>A: access token and refresh token
    U->>A: taps "Link Google account"
    A->>G: Google's window, pick the account
    G-->>A: ID token
    A->>S: POST /auth/google/link { idToken } with Bearer access token
    S->>S: requireAuth: a valid session is required
    S->>S: verify the ID token exactly like at sign-in
    S->>D: UPDATE users SET google_sub WHERE id = me AND google_sub IS NULL
    alt that Google account belongs to someone else
        D-->>S: UNIQUE violation
        S-->>A: 409 That Google account is already used
    else free
        S-->>A: 200 the user, now with both ways in
    end
```

## Google first, then a password: use the emailed code

The code proves the inbox, so it can safely add a password to a Google-only account.

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#eaf6fc","primaryBorderColor":"#099bdd","primaryTextColor":"#17324a","lineColor":"#2f6f9f","signalColor":"#2f6f9f","signalTextColor":"#2f6f9f","noteBkgColor":"#fff6e0","noteTextColor":"#17324a","actorBkg":"#eaf6fc","actorBorder":"#099bdd","actorTextColor":"#17324a","actorLineColor":"#2f6f9f","fontSize":"15px"}}}%%
sequenceDiagram
    autonumber
    actor U as Person
    participant A as Flutter app
    participant S as Node API
    participant M as Mailbox

    U->>A: Register with the same email
    A->>S: POST /auth/register
    S-->>A: 409 That email has an account. Sign in, or use Forgot password.
    U->>A: Forgot password
    A->>S: POST /auth/forgot-password
    S--)M: code
    M-->>U: the code
    U->>A: code and a new password
    A->>S: POST /auth/reset-password
    S-->>A: 200 Password changed
    Note over U,S: the same account now has google_sub and a password hash
```

## Why we never merge on the email alone

Anyone can register with any address. We have not checked that the inbox is theirs. This attack has a name: **pre-account hijacking**.

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#eaf6fc","primaryBorderColor":"#099bdd","primaryTextColor":"#17324a","lineColor":"#2f6f9f","signalColor":"#2f6f9f","signalTextColor":"#2f6f9f","noteBkgColor":"#fff6e0","noteTextColor":"#17324a","actorBkg":"#eaf6fc","actorBorder":"#099bdd","actorTextColor":"#17324a","actorLineColor":"#2f6f9f","fontSize":"15px"}}}%%
sequenceDiagram
    autonumber
    actor M as Mallory (attacker)
    participant S as The app's server
    actor V as Victim

    M->>S: register victim@example.com with a password only Mallory knows
    Note over S: the email was never verified, so the server cannot tell
    V->>S: Sign in with Google (verified email: victim@example.com)

    rect rgba(214, 69, 69, 0.12)
        Note over S: UNSAFE design: merge on the email match
        S-->>V: signed in, to the account Mallory prepared
        V->>S: saves notes, adds data
        M->>S: log in with her password
        S-->>M: sees everything the victim saved
    end

    rect rgba(46, 158, 87, 0.12)
        Note over S: OUR design: refuse and ask for proof of both doors
        S-->>V: 409 sign in with your password, then link Google
    end
```

The emailed code also settles the squatting case: the real owner can always take the account back, because only they can read the inbox, and the reset ends every session of the squatter.

## What would make an automatic merge safe

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#eaf6fc","primaryBorderColor":"#099bdd","primaryTextColor":"#17324a","lineColor":"#2f6f9f","edgeLabelBackground":"#ffffff","fontSize":"15px"}}}%%
flowchart LR
    a["password account"] --> v{"email verified<br/>at registration?"}
    g["Google account"] --> w{"email_verified<br/>in the ID token?"}
    v -- no --> stop["do not merge<br/>(this workshop)"]
    v -- yes --> both{"both sides<br/>verified?"}
    w --> both
    both -- yes --> merge["merge is safe:<br/>the same proven inbox"]
    both -- no --> stop

    classDef good fill:#e6f6ea,stroke:#2e9e57,color:#17324a,stroke-width:2px;
    classDef bad fill:#fdecea,stroke:#d64545,color:#17324a,stroke-width:2px;
    classDef box fill:#eaf6fc,stroke:#099bdd,color:#17324a,stroke-width:2px;
    class merge good;
    class stop bad;
    class a,g box;
```
