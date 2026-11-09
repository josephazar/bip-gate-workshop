# Diagrams

Every page here explains one idea with [Mermaid](https://mermaid.js.org/) diagrams, which GitHub draws for you. They follow the order of the nine steps.

| Page | What it shows | Steps |
|---|---|---|
| [architecture.md](architecture.md) | the three boxes, the nine steps, inside the API, the data model, the folders | 1, 2 |
| [jwt.md](jwt.md) | what a JWT is, sign and verify, 401 and 403, access and refresh tokens, rotation and replay | 4, 5, 6 |
| [password-auth.md](password-auth.md) | register, login, forgot password with a one-time code, the reset code's life | 3, 4, 6 |
| [oauth-google.md](oauth-google.md) | OAuth in one story, the roles, the Google flow, what the server checks, the console setup | 7 |
| [account-linking.md](account-linking.md) | one person with two doors, linking, why never merge on the email alone | 7 |
| [app.md](app.md) | the Flutter layers, the session states, the screens, restoring the session, one refresh at a time | 8 |
| [run-and-test.md](run-and-test.md) | what `start.sh` does, the checklist, what the tests try | 9 |

## The whole system in one picture

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#eaf6fc","primaryBorderColor":"#099bdd","primaryTextColor":"#17324a","lineColor":"#2f6f9f","signalColor":"#2f6f9f","signalTextColor":"#2f6f9f","noteBkgColor":"#fff6e0","noteTextColor":"#17324a","actorBkg":"#eaf6fc","actorBorder":"#099bdd","actorTextColor":"#17324a","actorLineColor":"#2f6f9f","fontSize":"15px"}}}%%
sequenceDiagram
    autonumber
    actor U as Person
    participant A as Flutter app
    participant S as Node API
    participant D as PostgreSQL
    participant G as Google

    rect rgba(9, 155, 221, 0.10)
        Note over U,D: a password user
        U->>A: register or log in
        A->>S: POST /auth/register or /auth/login
        S->>D: hash and INSERT, or look up and verify
        S-->>A: access token (15 min) and refresh token
    end
    rect rgba(224, 161, 0, 0.12)
        Note over U,G: a Google user
        U->>A: Sign in with Google
        A->>G: Google's own window
        G-->>A: ID token
        A->>S: POST /auth/google
        S->>G: verify with Google's public keys
        S->>D: find or create by google_sub
        S-->>A: the same kind of tokens
    end
    rect rgba(46, 158, 87, 0.10)
        Note over A,D: from then on
        A->>S: GET /me with the access token
        S->>D: the user, and the role, from the database
        S-->>A: 200, or 401, or 403
        A->>S: POST /auth/refresh when the token expires
    end
```
