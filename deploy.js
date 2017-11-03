const Web3 = require("web3");
const net = require("net");

const BigNumber = require("bignumber.js");
const decimalFactor = new BigNumber(10).pow(18);

const lakoo0 = "0x81F9B6c7129CEe90feD5Df241fA6dC4F88a19699";
const lakoo1 = "0x774C5e98Df8D00Dadd4C93e671cC57c006AdCA2b";
const lakoo2 = "0x62C588dD46BF03aff90c700b4Ed255D1086E7A8b";

const owners = [lakoo0, lakoo1, lakoo2];

const deployer = lakoo0;
const gasPrice = "1000000000"; // 1 Gwei
const gasLimit = 4000000;
const deployInfo = {
    initialSupply: decimalFactor.times(50000000),
    airdropLimit: decimalFactor.times(10),
    privateFundUnlockTime: Math.floor(Date.parse("2017-11-03T17:00:00+0800") / 1000),

    crowdsaleStart: Math.floor(Date.parse("2017-11-01T16:15:00+0800") / 1000),
    crowdsaleEnd: Math.floor(Date.parse("2017-11-01T17:15:00+0800") / 1000),
    coinsPerEth: 250000000,
    hardCap: decimalFactor.times(1000000000),
    referrerBonusPercent: 5,

    contributorpool: {
        owners,
        threshold: 2,
        lockDuration: 60 * 30,
        value: decimalFactor.times(200000000)
    },

    usergrowthpool: [
        [Math.floor(Date.parse("2017-11-03T16:30:00+0800") / 1000), decimalFactor.times(200000000)],
        [Math.floor(Date.parse("2017-11-03T16:40:00+0800") / 1000), decimalFactor.times(100000000)],
        [Math.floor(Date.parse("2017-11-03T16:50:00+0800") / 1000), decimalFactor.times(90000000)],
        [Math.floor(Date.parse("2017-11-03T17:00:00+0800") / 1000), decimalFactor.times(80000000)],
        [Math.floor(Date.parse("2017-11-03T17:10:00+0800") / 1000), decimalFactor.times(70000000)],
        [Math.floor(Date.parse("2017-11-03T17:20:00+0800") / 1000), decimalFactor.times(60000000)],
        [Math.floor(Date.parse("2017-11-03T17:30:00+0800") / 1000), decimalFactor.times(50000000)],
        [Math.floor(Date.parse("2017-11-03T17:40:00+0800") / 1000), decimalFactor.times(40000000)],
        [Math.floor(Date.parse("2017-11-03T17:50:00+0800") / 1000), decimalFactor.times(30000000)],
        [Math.floor(Date.parse("2017-11-03T18:00:00+0800") / 1000), decimalFactor.times(20000000)],
        [Math.floor(Date.parse("2017-11-03T18:10:00+0800") / 1000), decimalFactor.times(10000000)],
    ].map((info) => ({ owners, threshold: 2, mintTime: info[0], mintValue: info[1] }))
};

const web3 = new Web3("/Users/Chung/Library/Ethereum/geth.ipc", net);

const LikeCoinBuild = require("./build/contracts/LikeCoin.json");
const LikeCrowdsaleBuild = require("./build/contracts/LikeCrowdsale.json");
const ContributorPoolBuild = require("./build/contracts/ContributorPool.json");
const UserGrowthPoolBuild = require("./build/contracts/UserGrowthPool.json");

let gasConsumed = 0;

async function send(tx) {
    const gas = (await tx.estimateGas({
        from: deployer,
        gas: gasLimit,
    }));
    if (gas >= gasLimit) {
        throw new Error("Exceed gas limit!");
    }
    console.log(`Gas consumption = ${gas}`);
    const result = await tx.send({
        from: deployer,
        gasPrice,
        gas: gas + 1
    });
    gasConsumed += gas;
    return result;
}

async function deploy(build, ...args) {
    const deployTx = await new web3.eth.Contract(build.abi).deploy({
        data: build.unlinked_binary,
        arguments: args
    });
    return await send(deployTx);
}

async function deployLikeCoin() {
    console.log(`Deploying LikeCoin contract...`);
    const LikeCoin = await deploy(LikeCoinBuild, deployInfo.initialSupply, deployInfo.airdropLimit);
    console.log(`LikeCoin deployed, address: ${LikeCoin.options.address}`);
    return LikeCoin;
}

async function deployLikeCrowdsale(LikeCoin) {
    const {crowdsaleStart, crowdsaleEnd, coinsPerEth, hardCap, referrerBonusPercent, privateFundUnlockTime} = deployInfo;
    console.log(`Deploying LikeCrowdsale contract...`);
    const LikeCrowdsale = await deploy(LikeCrowdsaleBuild, LikeCoin.options.address, crowdsaleStart, crowdsaleEnd, coinsPerEth, hardCap, referrerBonusPercent);
    console.log(`LikeCrowdsale deployed, address: ${LikeCrowdsale.options.address}`);
    console.log(`Registering Crowdsale...`);
    await send(LikeCoin.methods.registerCrowdsales(LikeCrowdsale.options.address, hardCap, privateFundUnlockTime));
    console.log(`Registered Crowdsale.`);
    return LikeCrowdsale;
}

async function deployContributorPool(LikeCoin) {
    const {owners, lockDuration, threshold, value} = deployInfo.contributorpool;
    console.log(`Deploying ContributorPool contract...`);
    const ContributorPool = await deploy(ContributorPoolBuild, LikeCoin.options.address, owners, lockDuration, threshold);
    console.log(`ContributorPool deployed, address: ${ContributorPool.options.address}`);
    console.log(`Registering ContributorPool...`);
    await send(LikeCoin.methods.registerContributorPool(ContributorPool.options.address, value));
    console.log(`Registered ContributorPool.`);
    return ContributorPool;
}

async function deployUserGrowthPools(LikeCoin) {
    const pools = [];
    for (let i = 0; i < deployInfo.usergrowthpool.length; i++) {
        const {owners, threshold, mintTime, mintValue} = deployInfo.usergrowthpool[i];
        console.log(`Deploying UserGrowthPool contract ${i}...`);
        const UserGrowthPool = await deploy(UserGrowthPoolBuild, LikeCoin.options.address, owners, threshold, mintTime, mintValue);
        console.log(`UserGrowthPool ${i} deployed, address: ${UserGrowthPool.options.address}`);
        pools.push(UserGrowthPool);
    }
    console.log(`Registering UserGrowthPools...`);
    await send(LikeCoin.methods.registerUserGrowthPools(pools.map((pool) => pool.options.address)));
    console.log(`Registered UserGrowthPools.`);
    return pools;
}

async function main() {
    const LikeCoin = await deployLikeCoin();
    await deployLikeCrowdsale(LikeCoin);
    await deployContributorPool(LikeCoin);
    await deployUserGrowthPools(LikeCoin);
    console.log(`All deployed, total gas consumption = ${gasConsumed}`);
}

main();
