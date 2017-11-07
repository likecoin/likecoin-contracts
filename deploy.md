## Introduction

The deployment script `deploy.js` will deploy LikeCoin, LikeCrowdsale, UserGrowthPool and ContributorPool contracts, and link all contracts to the LikeCoin contract.

## Deployment procedure

1. Install the `web3` npm packege (e.g. `npm install web3`)
2. Setup an Ethereum node with IPC or RPC API, with deployer's address unlocked (e.g. `geth --rinkeby --syncmode fast --cache 1024 --ipcpath /Users/chung/Library/Ethereum/geth.ipc --unlock "0x81F9B6c7129CEe90feD5Df241fA6dC4F88a19699"`)
3. Find line 59 in `deploy.sh`: `const web3 = new Web3("/Users/Chung/Library/Ethereum/geth.ipc", net);`, modify it to match the IPC or RPC address in step 2
4. Run `node deploy.js`
