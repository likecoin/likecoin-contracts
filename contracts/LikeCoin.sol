pragma solidity ^0.4.15;

import "./ERC20.sol";

contract LikeCoin is ERC20 {
    string constant public name = "Like Coin";
    string constant public symbol = "LIKE";
    uint8 constant public decimals = 10;

    uint256 public supply;
    mapping(address => uint256) public balances;
    mapping(address => mapping(address => uint256)) public allowed;

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

    // TODO: allow minting for multi-stage crowdsale
    // TODO: allow burning unsold tokens
}
