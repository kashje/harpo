/** @type {import('semantic-release').GlobalConfig} */
module.exports = {
  branches: ["main", { name: "next", prerelease: true }],
  plugins: [
    [
      "@semantic-release/commit-analyzer",
      {
        preset: "angular",
        releaseRules: [{ type: "hotfix", release: "patch" }],
      },
    ],
    "@semantic-release/release-notes-generator",
    "@semantic-release/git",
  ],
};
