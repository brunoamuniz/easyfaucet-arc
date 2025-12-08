# Security Checklist

## ✅ Safe to Commit

- Contract addresses (public information)
- Chain configurations (public information)
- ABI files (public information)
- Frontend code
- Smart contract source code
- Example scripts (`.example` files)

## ⚠️ Never Commit

- Private keys
- `.env` files
- Scripts with hardcoded private keys (`scripts/fund-faucet.sh`, `scripts/deploy-faucet.sh`)
- Foundry cache/artifacts (`cache/`, `broadcast/`, `out/`)
- OpenZeppelin contracts (`lib/openzeppelin-contracts/`)

## 🔒 Protected Files

The following files are in `.gitignore` and will NOT be committed:

- `.env` and `.env.*` files
- `scripts/fund-faucet.sh`
- `scripts/deploy-faucet.sh`
- `cache/`, `broadcast/`, `out/` (Foundry artifacts)
- `lib/openzeppelin-contracts/` (dependencies)

## 📝 Before Pushing

1. ✅ Verify no private keys in committed files
2. ✅ Check `.gitignore` is up to date
3. ✅ Use example files (`.example`) for documentation
4. ✅ Use environment variables for sensitive data

## 🚨 If You Accidentally Committed Sensitive Data

1. **Immediately rotate/revoke** any exposed keys
2. Remove from git history:
   ```bash
   git filter-branch --force --index-filter \
     "git rm --cached --ignore-unmatch path/to/file" \
     --prune-empty --tag-name-filter cat -- --all
   ```
3. Force push (⚠️ coordinate with team first)
4. Consider the repository compromised and rotate all keys

