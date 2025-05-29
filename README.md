# Kyoku Wallet

**An open-source, secure, and user-friendly self-custodial cryptocurrency wallet for the Solana blockchain.**  
Manage your tokens & NFTs, explore dApps, and engage with DeFi seamlessly.

Kyoku Wallet is a Chrome browser extension designed to provide a safe and intuitive gateway to the Solana ecosystem. Whether you're managing SPL tokens, curating your NFT collection, interacting with decentralized applications (dApps), or diving into DeFi, Kyoku aims to make your Solana experience smooth and secure. As an open-source project, we prioritize transparency and community trust.

---

## ✨ Key Features

- 🔒 **Secure Self-Custody**  
  Full control over your keys and assets. Private keys are encrypted and stored locally.
- 🪙 **Comprehensive Token Management**  
  Send, receive, and view your SOL and SPL tokens.
- 🖼️ **NFT Experience**  
  View and manage your NFT collections. Set your favourite NFT as an account profile picture and burn unwanted tokens/NFTs.
- 🔗 **Seamless dApp Interaction**  
  Connect to Solana dApps with ease, approve transactions, and sign messages securely.
- 🔄 **Integrated Swapping**  
  Swap tokens directly within the wallet, powered by the Jupiter Aggregator for competitive rates.
- 📊 **Portfolio Overview**  
  Track your crypto asset portfolio.
- 📜 **Activity History**  
  Review your detailed transaction history.
- ⚙️ **Advanced Account Management**  
  - Create multiple derived accounts  
  - Import existing Solana wallets (mnemonic/recovery phrase, private key)  
  - Add view-only accounts to monitor addresses
- 🌐 **Customizable**  
  - Choose your network (Mainnet, Devnet, Testnet, Custom RPC)  
  - Select your preferred block explorer  
  - Set transaction priority fees  
  - Multi-language and currency display support
- 💖 **Open Source**  
  Built with transparency for the community.

---

## 📝 Note

> **⚠️ Under active development.**  
> While we strive for security and stability, please use Kyoku Wallet at your own risk, especially with mainnet assets.  
> Ensure you have backed up your recovery phrases securely.

We welcome code reviews and contributions—see [Contributing](#contributing) below for details.

---

## 📖 Table of Contents

1. [Installing the Latest Release](#installing-the-latest-release)  
2. [Developing Locally](#developing-locally)  
   - [Prerequisites](#prerequisites)  
   - [Clone the Repository](#clone-the-repository)  
   - [Install Dependencies](#install-dependencies)  
   - [Environment Variables](#environment-variables)  
   - [Build for Production/Development](#build-for-productiondevelopment)  
   - [Start Development Server](#start-development-server)  
   - [Running Tests](#running-tests)  
   - [Install the Development Version of the Extension](#install-the-development-version-of-the-extension)  
3. [Tech Stack](#tech-stack)  
4. [Contributing](#contributing)  
5. [License](#license)  
6. [Connect With Us](#connect-with-us)

---

## 🚀 Installing the Latest Release

### 1. From Chrome Web Store (Recommended)

1. Visit the [Kyoku Wallet page on the Chrome Web Store](#).  
2. Click **Add to Chrome**.

### 2. Manual Installation (Developer Mode)

1. Download `kyoku-wallet-vX.X.X.zip` from our [Releases page](https://github.com/kyoku-labs/kyoku-wallet/releases).
2. Unzip the file.
3. Open Chrome and go to `chrome://extensions`.
4. Enable **Developer mode** (toggle in the top right).
5. Click **Load unpacked** and select the unzipped `dist` folder.

---

## 🛠️ Developing Locally

Interested in contributing or running Kyoku Wallet from source? Follow these steps.

### Prerequisites

- [Node.js](https://nodejs.org/) (v18.x or later)  
- [npm](https://www.npmjs.com/) or [Yarn](https://yarnpkg.com/)

### Clone the Repository

```bash
git clone https://github.com/kyoku-labs/kyoku-wallet.git
cd kyoku-wallet
