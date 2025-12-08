# 🚰 Easy Faucet Arc

> A gasless ERC-20 token faucet for ARC Testnet. Get 100 USDC testnet tokens without paying gas fees!

[![Next.js](https://img.shields.io/badge/Next.js-16.0-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.20-orange)](https://soliditylang.org/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

## ✨ Features

- 🆓 **100% Gasless** - Users don't pay any gas fees. The contract owner covers all transaction costs.
- 🔐 **Secure** - Only the contract owner can execute claims, preventing unauthorized access.
- 💰 **100 USDC per Claim** - Get 100 USDC testnet tokens per claim (vs 1 USDC/hour from official faucet).
- ⏰ **24-Hour Cooldown** - One claim per address every 24 hours to prevent abuse.
- 🔗 **Wallet Integration** - Connect your wallet to auto-fill your address, or enter manually.
- 🎨 **Modern UI** - Beautiful, responsive interface built with Next.js and Tailwind CSS.
- 📱 **Mobile Friendly** - Works seamlessly on all devices.

## 🏗️ Architecture

```
┌─────────────┐
│   Frontend  │  User enters address or connects wallet
│  (Next.js)  │
└──────┬──────┘
       │ HTTP POST /api/claim
       │ { address: "0x..." }
       ▼
┌─────────────┐
│   Backend   │  Validates, checks cooldown, rate limits
│  (API Route) │
└──────┬──────┘
       │ claimFor(address)
       │ (owner pays gas)
       ▼
┌─────────────┐
│   Contract  │  Transfers 100 USDC to user
│  (Smart     │
│   Contract) │
└─────────────┘
```

## 🛠️ Tech Stack

### Frontend
- **Next.js 16** - React framework with App Router
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first CSS framework
- **RainbowKit** - Wallet connection UI
- **wagmi** - React Hooks for Ethereum
- **viem** - TypeScript Ethereum library

### Smart Contract
- **Solidity 0.8.20** - Smart contract language
- **Foundry** - Development framework
- **OpenZeppelin** - Security-focused contract library

### Backend
- **Next.js API Routes** - Serverless API endpoints
- **Rate Limiting** - In-memory rate limiting (5 requests/min per IP)

## 📋 Prerequisites

- Node.js 18+ and npm
- Foundry (for smart contract development)
- A wallet with ARC Testnet configured
- Private key of the contract owner (for API)

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone <repository-url>
cd easyfaucet-arc
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Environment Variables

Create a `.env.local` file in the root directory:

```env
# Private key of the contract owner (for executing claims)
PRIVATE_KEY=0x...

# ARC Testnet RPC URL (optional, defaults to https://rpc.testnet.arc.network)
ARC_TESTNET_RPC_URL=https://rpc.testnet.arc.network
```

**⚠️ Important:** Never commit your `.env.local` file. It's already in `.gitignore`.

### 4. Configure Contract Address

Update the contract address in `lib/config/faucet.ts`:

```typescript
export const FAUCET_CONTRACT_ADDRESS = "0x..." as const;
```

### 5. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📁 Project Structure

```
easyfaucet-arc/
├── app/
│   ├── api/
│   │   └── claim/
│   │       └── route.ts          # API endpoint for gasless claims
│   ├── page.tsx                  # Main faucet page
│   ├── layout.tsx                # Root layout
│   └── providers.tsx             # Wallet providers (wagmi + RainbowKit)
├── contracts/
│   └── ArcTestnetFaucet.sol      # Smart contract
├── lib/
│   ├── config/
│   │   ├── chains.ts             # ARC Testnet chain configuration
│   │   └── faucet.ts             # Faucet contract configuration
│   ├── contracts/
│   │   └── ArcTestnetFaucet.abi.ts  # Contract ABI
│   └── utils/
│       └── errorDecoder.ts       # Error decoding utilities
├── public/                       # Static assets
├── docs/                         # Documentation
└── tests/                        # E2E tests (Playwright)
```

## 🔧 Smart Contract

### Contract Address

**ARC Testnet:** `0xbDA9712b00176b2bC3CE9abfD3EdF0742b2bDe2A`

[View on ArcScan](https://testnet.arcscan.app/address/0xbDA9712b00176b2bC3CE9abfD3EdF0742b2bDe2A)

### Key Functions

#### Public Functions
- `canClaim(address user)` - Check if an address can claim and get remaining cooldown
- `faucetBalance()` - Get current faucet balance
- `paused()` - Check if faucet is paused

#### Owner Functions
- `claimFor(address recipient)` - Execute claim for a recipient (gasless)
- `setClaimAmount(uint256)` - Update claim amount
- `setCooldown(uint256)` - Update cooldown period
- `setPaused(bool)` - Pause/unpause faucet
- `withdrawTokens(address, uint256)` - Withdraw tokens from faucet

### Compile & Deploy

```bash
# Compile contract
forge build

# Deploy (using Foundry script)
forge script script/Deploy.s.sol \
  --rpc-url https://rpc.testnet.arc.network \
  --private-key $PRIVATE_KEY \
  --broadcast \
  --legacy
```

## 🌐 Deployment

### Deploy to Vercel

1. Push your code to GitHub
2. Import project in [Vercel](https://vercel.com)
3. Add environment variables:
   - `PRIVATE_KEY` - Contract owner's private key
   - `ARC_TESTNET_RPC_URL` - (Optional) RPC URL
4. Deploy!

### Environment Variables (Vercel)

```env
PRIVATE_KEY=0x...
ARC_TESTNET_RPC_URL=https://rpc.testnet.arc.network
```

## 🔒 Security

- ✅ **ReentrancyGuard** - Prevents reentrancy attacks
- ✅ **SafeERC20** - Safe token transfers
- ✅ **Ownable** - Access control for admin functions
- ✅ **Rate Limiting** - API rate limiting (5 req/min per IP)
- ✅ **Input Validation** - All inputs are validated
- ✅ **Custom Errors** - Gas-efficient error handling

## 📊 API Endpoints

### POST `/api/claim`

Execute a gasless claim for an address.

**Request:**
```json
{
  "address": "0x..."
}
```

**Response (Success):**
```json
{
  "success": true,
  "transactionHash": "0x...",
  "address": "0x..."
}
```

**Response (Error):**
```json
{
  "error": "Cooldown active",
  "remainingSeconds": 3600,
  "message": "Please wait 1h 0m before claiming again."
}
```

## 🧪 Testing

### Run E2E Tests

```bash
npm run test
```

### Run Playwright Tests

```bash
npx playwright test
```

## 📝 Configuration

### Update Claim Amount

Edit `lib/config/faucet.ts`:

```typescript
export const CLAIM_AMOUNT = BigInt(100 * 10 ** 6); // 100 USDC
```

### Update Cooldown

```typescript
export const COOLDOWN_SECONDS = 24 * 60 * 60; // 24 hours
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [ARC Network](https://arc.network/) - For the testnet infrastructure
- [OpenZeppelin](https://www.openzeppelin.com/) - For secure contract libraries
- [RainbowKit](https://www.rainbowkit.com/) - For wallet connection UI
- [wagmi](https://wagmi.sh/) - For Ethereum React hooks

## 📞 Support

If you encounter any issues or have questions:

1. Check the [documentation](./docs/)
2. Open an issue on GitHub
3. Review the [implementation status](./IMPLEMENTATION_STATUS.md)

## 🎯 Roadmap

- [ ] Add analytics dashboard
- [ ] Implement Redis for rate limiting
- [ ] Add multi-chain support
- [ ] Create admin dashboard
- [ ] Add email notifications
- [ ] Implement referral system

---

Made with ❤️ for the ARC Network community
