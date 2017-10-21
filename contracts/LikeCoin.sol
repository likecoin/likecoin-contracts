pragma solidity ^0.4.15;

import "./ERC20.sol";

contract LikeCoin is ERC20 {
    string constant public name = "Like Coin";
    string constant public symbol = "LIKE";

    // Synchronized to Ether -> Wei ratio, which is important
    uint8 constant public decimals = 18;

    uint256 public supply;
    mapping(address => uint256) public balances;
    mapping(address => mapping(address => uint256)) public allowed;

    address public crowdsaleAddr;
    address public contributorPoolAddr;
    address[] public userGrowthPoolAddrs;
    mapping (address => bool) isUserGrowthPool;
    mapping (address => bool) userGrowthPoolMinted;

    function LikeCoin(uint256 _initialSupply) {
        supply = _initialSupply;
        balances[msg.sender] = _initialSupply;
    }

    function totalSupply() constant returns (uint256 totalSupply) {
        return supply;
    }

    function balanceOf(address _owner) constant returns (uint256 balance) {
        return balances[_owner];
    }

    function _transfer(address _from, address _to, uint256 _value) internal returns (bool success) {
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

    function transferFrom(address _from, address _to, uint256 _value) returns (bool success) {
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

    function registerCrowdsales(address _crowdsaleAddr, uint256 _value) {
        require(crowdsaleAddr == 0x0);
        require(_crowdsaleAddr != 0x0);
        crowdsaleAddr = _crowdsaleAddr;
        supply += _value;
        balances[_crowdsaleAddr] += _value;
        Transfer(0x0, crowdsaleAddr, _value);
    }

    function registerContributorPool(address _contributorPoolAddr, uint256 _value) {
        require(contributorPoolAddr == 0x0);
        require(_contributorPoolAddr != 0x0);
        contributorPoolAddr = _contributorPoolAddr;
        supply += _value;
        balances[contributorPoolAddr] += _value;
        Transfer(0x0, contributorPoolAddr, _value);
    }

    function registerUserGrowthPools(address[] _poolAddrs) {
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
