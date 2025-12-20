/**
 * Minimal ERC20 ABI for token operations
 * Only includes functions needed for auto-refill: balanceOf and transfer
 */

export const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "_owner", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "transfer",
    inputs: [
      { name: "_to", type: "address" },
      { name: "_value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
] as const;
