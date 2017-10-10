pragma solidity ^0.4.15;

// Wallet is a contract representing an account.
// With the Wallet contract, user can delegate transactions and the corresponding transaction fee to others.
// The user can also change to another Ethereum account without losing the tokens.

contract Wallet {
    bytes4 constant transferAbi = bytes4(sha3("transfer(address,uint256)"));
    bytes4 constant approveAbi  = bytes4(sha3("approve(address,uint256)"));
    address tokenAddress;
    address owner;

    function Wallet(address _tokenAddress, address _owner) {
        tokenAddress = _tokenAddress;
        owner = _owner;
    }

    function transfer(address _to, uint256 _value) returns (bool success) {
        require(msg.sender == owner);
        // Calling `transfer` function defined by ERC-20 in `tokenAddress`.
        // In the called `transfer` function, `msg.sender` will be the address of the Wallet contract.
        require(tokenAddress.call(transferAbi, _to, _value));
        return true;
    }

    function approve(address _spender, uint256 _value) returns (bool success) {
        require(msg.sender == owner);
        require(tokenAddress.call(approveAbi, _spender, _value));
        return true;
    }

    // TODO: allow non-owner to do transaction using owner's signature
    // TODO: allow changing owner
}
