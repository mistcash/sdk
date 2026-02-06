// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

// https://astro.build/config
export default defineConfig({
  integrations: [
    starlight({
      title: "MIST.cash SDK",
      description:
        "Privacy-focused SDK for zero-knowledge transactions on Starknet",
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/mistcash/sdk",
        },
      ],
      customCss: ["./src/styles/custom.css"],
      sidebar: [
        {
          label: "Start Here",
          items: [
            { label: "Introduction", slug: "introduction" },
            { label: "Getting Started", slug: "getting-started" },
          ],
        },
        {
          label: "Packages",
          items: [
            { label: "@mistcash/sdk", slug: "packages/core" },
            { label: "@mistcash/config", slug: "packages/config" },
            { label: "@mistcash/react", slug: "packages/react" },
          ],
        },
        {
          label: "Guides",
          items: [
            { label: "Depositing Tokens", slug: "guides/deposit" },
            { label: "Withdrawing Tokens", slug: "guides/withdraw" },
            { label: "Zero-Knowledge Proofs", slug: "guides/zero-knowledge" },
            { label: "Merkle Trees", slug: "guides/merkle-trees" },
          ],
        },
        {
          label: "Reference",
          items: [
            { label: "API Reference", slug: "reference/api" },
            { label: "Types", slug: "reference/types" },
            { label: "Contract ABI", slug: "reference/contract" },
          ],
        },
      ],
    }),
  ],
});
