pragma solidity ^0.4.15;

import "./ERC20.sol";

contract LikeCoin is ERC20 {
    string constant public name = "LikeCoin";
    string constant public symbol = "LIKE";

    // Synchronized to Ether -> Wei ratio, which is important
    uint8 constant public decimals = 18;

    uint256 public supply;
    mapping(address => uint256) public balances;
    mapping(address => mapping(address => uint256)) public allowed;

    address public owner;
    address public crowdsaleAddr;
    address public contributorPoolAddr;
    address[] public userGrowthPoolAddrs;
    uint256 public airdropLimit;
    mapping (address => bool) isUserGrowthPool;
    mapping (address => bool) userGrowthPoolMinted;
    mapping(address => uint256) public lockedBalances;
    uint public unlockTime = 0;
    event TransferLocked(address indexed _from, address indexed _to, uint256 _value);

    function LikeCoin(uint256 _initialSupply, uint256 _airdropLimit) public {
        owner = msg.sender;
        supply = _initialSupply;
        balances[this] = _initialSupply;
        airdropLimit = _airdropLimit;
    }

    function totalSupply() constant returns (uint256) {
        return supply;
    }

    function balanceOf(address _owner) public constant returns (uint256 balance) {
        return balances[_owner] + lockedBalances[_owner];
    }

    function _transfer(address _from, address _to, uint256 _value) internal returns (bool success) {
        if (unlockTime != 0 && now >= unlockTime && lockedBalances[_from] > 0) {
            balances[_from] += lockedBalances[_from];
            lockedBalances[_from] = 0;
        }
        require(balances[_from] >= _value);
        require(balances[_to] + _value > balances[_to]);
        balances[_from] -= _value;
        balances[_to] += _value;
        Transfer(_from, _to, _value);
        return true;
    }

    function transfer(address _to, uint256 _value) returns (bool success) {
        return _transfer(msg.sender, _to, _value);
    }

    function transferAndLock(address _to, uint256 _value) public returns (bool success) {
        require(now < unlockTime);
        require(balances[msg.sender] >= _value);
        require(lockedBalances[_to] + _value > lockedBalances[_to]);
        balances[msg.sender] -= _value;
        lockedBalances[_to] += _value;
        TransferLocked(msg.sender, _to, _value);
        return true;
    }

    function transferFrom(address _from, address _to, uint256 _value) public returns (bool success) {
        require(allowed[_from][msg.sender] >= _value);
        _transfer(_from, _to, _value);
        allowed[_from][msg.sender] -= _value;
        return true;
    }

    function approve(address _spender, uint256 _value) returns (bool success) {
        allowed[msg.sender][_spender] = _value;
        Approval(msg.sender, _spender, _value);
        return true;
    }

    function allowance(address _owner, address _spender) constant returns (uint256 remaining) {
        return allowed[_owner][_spender];
    }

    function burn(uint256 _value) {
        require(balances[msg.sender] >= _value);
        balances[msg.sender] -= _value;
        supply -= _value;
        Transfer(msg.sender, 0x0, _value);
    }

    function airdrop(address[] _addrs, uint256 _value) public {
        require(msg.sender == owner);
        require(_addrs.length > 0);
        require(_value > 0);
        require(_value <= airdropLimit);
        uint256 total = _addrs.length * _value;
        require(total / _addrs.length == _value);
        require(balances[this] >= total);
        for (uint i = 0; i < _addrs.length; i++) {
            balances[_addrs[i]] += _value;
            Transfer(this, _addrs[i], _value);
        }
        balances[this] -= total;
    }

    function registerCrowdsales(address _crowdsaleAddr, uint256 _value, uint256 _privateFundUnlockTime) public {
        require(msg.sender == owner);
        require(crowdsaleAddr == 0x0);
        require(_crowdsaleAddr != 0x0);
        require(_privateFundUnlockTime > now);
        unlockTime = _privateFundUnlockTime;
        crowdsaleAddr = _crowdsaleAddr;
        supply += _value;
        balances[_crowdsaleAddr] += _value;
        Transfer(0x0, crowdsaleAddr, _value);
    }

    function registerContributorPool(address _contributorPoolAddr, uint256 _value) {
        require(msg.sender == owner);
        require(contributorPoolAddr == 0x0);
        require(_contributorPoolAddr != 0x0);
        contributorPoolAddr = _contributorPoolAddr;
        supply += _value;
        balances[contributorPoolAddr] += _value;
        Transfer(0x0, contributorPoolAddr, _value);
    }

    function registerUserGrowthPools(address[] _poolAddrs) {
        require(msg.sender == owner);
        require(userGrowthPoolAddrs.length == 0);
        require(_poolAddrs.length > 0);
        for (uint i = 0; i < _poolAddrs.length; i++) {
            userGrowthPoolAddrs.push(_poolAddrs[i]);
            isUserGrowthPool[_poolAddrs[i]] = true;
        }
    }

    function mintForUserGrowthPool(uint256 _value) {
        require(isUserGrowthPool[msg.sender]);
        require(!userGrowthPoolMinted[msg.sender]);
        userGrowthPoolMinted[msg.sender] = true;
        supply += _value;
        balances[msg.sender] += _value;
        Transfer(0x0, msg.sender, _value);
    }
}
