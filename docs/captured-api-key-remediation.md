# Captured Google API key alert (2026-11-12)

GitHub secret-scanning alert #1 points to historical Virginia Lottery diagnostic responses, not a credential configured by LotteryEdge. The capture manifest identifies `www.valottery.com/scratcher-search` and `gamesrv1.valottery.com` as sources. The matching value appeared in the response's `GooglePlacesApiConfiguration.ApiKey` field. Ownership and restrictions have not been verified with Google, and the key has not been tested or used.

The raw `data/va-discovery` captures are already absent from the current default branch. Removing a file in a later commit does not remove its earlier versions or resolve a secret-scanning alert. This change adds raw-capture ignore rules and a value-redacting, tracked-file Google API key pattern check to CI. This targeted guard is not a comprehensive secret scanner and does not scan historical commits.

## Remaining incident work

- Keep the historical alert open until its disposition is supported by evidence. Do not mark it revoked, false-positive, or safe merely because the current tree is clean.
- If this is a third party's credential, only its owner can verify restrictions or rotate/revoke it. Do not use the exposed value to test access.
- If historical removal is desired, first plan a coordinated history rewrite with backups and explicit approval. Old commit references, forks, cached views and clones may still retain the content; GitHub Support may be needed after rewriting.
- Do not commit raw HTML/network/HAR captures. Extract only the fields needed by the app into sanitized fixtures. Run `npm run test:secrets` and `npm run check:secrets` before committing.
