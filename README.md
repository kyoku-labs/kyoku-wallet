**An open-source, secure, and user-friendly self-custodial cryptocurrency wallet for the Solana blockchain. Manage your tokens & NFTs, explore dApps, and engage with DeFi seamlessly.**

Kyoku Wallet is a Chrome browser extension designed to provide a safe and intuitive gateway to the Solana ecosystem. Whether you're managing SPL tokens, curating your NFT collection, interacting with decentralized applications (dApps), or diving into DeFi, Kyoku aims to make your Solana experience smooth and secure. As an open-source project, we prioritize transparency and community trust.

## ✨ Key Features

* 🔒 **Secure Self-Custody:** Full control over your keys and assets. Private keys are encrypted and stored locally.
* 🪙 **Comprehensive Token Management:** Send, receive, and view your SOL and SPL tokens.
* 🖼️ **NFT Experience:** View and manage your NFT collections. Set your favorite NFT as an account profile picture and burn unwanted tokens/NFTs.
* 🔗 **Seamless dApp Interaction:** Connect to Solana dApps with ease, approve transactions, and sign messages securely.
* 🔄 **Integrated Swapping:** Swap tokens directly within the wallet, powered by the Jupiter Aggregator for competitive rates.
* 📊 **Portfolio Overview:** Track your crypto asset portfolio.
* 📜 **Activity History:** Review your detailed transaction history.
* ⚙️ **Advanced Account Management:**
    * Create multiple derived accounts.
    * Import existing Solana wallets (mnemonic/recovery phrase, private key).
    * Add view-only accounts to monitor addresses.
* 🌐 **Customizable:**
    * Choose your network (Mainnet, Devnet, Testnet, Custom RPC).
    * Select your preferred block explorer.
    * Set transaction priority fees.
    * Multi-language and currency display support.
* 💖 **Open Source:** Built with transparency for the community.

## 📝 Note

* Kyoku Wallet is under active development. While we strive for security and stability, please use it at your own risk, especially with mainnet assets.
* This code is open source. We encourage review and contributions.
* Ensure you have backed up your recovery phrases securely.

## 📖 Table of Contents

* [Installing the Latest Release](#installing-the-latest-release)
* [Developing Locally](#developing-locally)
    * [Prerequisites](#prerequisites)
    * [Clone the Repository](#clone-the-repository)
    * [Install Dependencies](#install-dependencies)
    * [Environment Variables](#environment-variables)
    * [Build for Production/Development](#build-for-productiondevelopment)
    * [Start Development Server](#start-development-server)
    * [Running Tests](#running-tests)
    * [Install the Development Version of the Extension](#install-the-development-version-of-the-extension)
* [Tech Stack](#tech-stack)
* [Contributing](#contributing)
* [License](#license)

## 🚀 Installing the Latest Release

1.  **From Chrome Web Store (Recommended for most users):**
    * Visit the [Kyoku Wallet page on the Chrome Web Store](). * Click "Add to Chrome."
2.  **Manual Installation (Developer Mode):**
    * Download the latest `kyoku-wallet-vX.X.X.zip` file from our [Releases page](https://github.com/kyoku-labs/kyoku-wallet/releases). * Unzip the file.
    * Open Chrome, navigate to `chrome://extensions`.
    * Enable "Developer mode" (usually a toggle in the top right).
    * Click "Load unpacked" and select the unzipped `dist` folder.

## 🛠️ Developing Locally

Interested in contributing or running Kyoku Wallet from the source? Here’s how:

### Prerequisites

* [Node.js](https://nodejs.org/) (v18.x or later recommended)
* [npm](https://www.npmjs.com/) (usually comes with Node.js) or [Yarn](https://yarnpkg.com/)

### Clone the Repository

```bash
git clone [https://github.com/kyoku-labs/kyoku-wallet.git](https://github.com/kyoku-labs/kyoku-wallet.git)
cd kyoku-wallet
Install Dependencies
We use npm for package management as defined in our scripts.

Bash

npm install
Environment Variables
Kyoku Wallet requires API keys for certain services (like Helius for enhanced NFT/token data and ExchangeRate-API for currency conversion).

Create a .env file in the root of the project by copying the example (if you create one) or creating it manually:
Bash

# .env
VITE_HELIUS_API_KEY="YOUR_HELIUS_API_KEY"
VITE_EXCHANGERATE_API_KEY="YOUR_EXCHANGERATE_API_KEY"
Replace "YOUR_HELIUS_API_KEY" and "YOUR_EXCHANGERATE_API_KEY" with your actual API keys.
Get a Helius API key from Helius.dev.
Get an ExchangeRate-API key from ExchangeRate-API.com.
Note: For tests, these variables are mocked in jest.setup.js.

Build for Production/Development
Production build (minified, no sourcemaps):
Bash

npm run build
Development build (unminified, with inline sourcemaps for easier debugging):
Bash

npm run build:dev
Files will be output to the dist/ directory.
Start Development Server (with Hot Reloading for UI)
This command starts the Vite development server, which is useful for working on the UI components (like popup, onboarding, confirmation pages) with hot reloading. Note that for testing the full extension functionality (background scripts, content scripts), you'll need to load the built extension into Chrome.

Bash

npm run dev
This typically serves the main popup UI (index.html) on http://localhost:3000 (or another port if 3000 is busy).

Running Tests
Execute the Jest test suite:

Bash

npm run test
To run tests in watch mode:

Bash

npm run test:watch
Install the Development Version of the Extension
Run npm run build:dev to create a development build in the dist folder.
Open Google Chrome and navigate to chrome://extensions.
Enable "Developer mode" (toggle in the top right).
Click "Load unpacked."
Select the dist folder from your kyoku-wallet project directory.
Kyoku Wallet should now appear in your extensions list and browser toolbar.
If you make changes to the source code, you'll need to run npm run build:dev again and then click the "reload" button for the extension in chrome://extensions for the changes to take effect in the background and content scripts. UI pages might hot-reload if you are also running npm run dev and have opened them directly in your browser, but for the actual extension popup, a reload in chrome://extensions is often needed.

💻 Tech Stack
TypeScript
React (for UI components)
Zustand (for state management)
Vite (for building and development server)
Tailwind CSS (for styling)
Solana/web3.js (for Solana blockchain interaction)
Jest & ts-jest (for testing)
i18next (for internationalization)

🌱 Contributing
We welcome contributions from the community! Whether it's bug reports, feature suggestions, or code contributions, we appreciate your help in making Kyoku Wallet better.

Please read our Contributing Guidelines before you start. ## 📜 License

Kyoku Wallet is open-source software licensed under the Your Chosen License, e.g., MIT License. 

 💬 Connect With Us

X (Twitter): @kyokuwallet *
