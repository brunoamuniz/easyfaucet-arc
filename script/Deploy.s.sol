// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {ArcTestnetFaucet} from "../contracts/ArcTestnetFaucet.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address usdcToken = 0x3600000000000000000000000000000000000000;
        uint256 claimAmount = 100_000_000; // 100 USDC (6 decimals)
        uint256 cooldown = 86_400; // 24 hours

        vm.startBroadcast(deployerPrivateKey);

        ArcTestnetFaucet faucet = new ArcTestnetFaucet(
            usdcToken,
            claimAmount,
            cooldown
        );

        vm.stopBroadcast();

        console.log("Faucet deployed at:", address(faucet));
    }
}

