/** @type {import('semantic-release').Options} */
module.exports = {
  branches: ["main", { name: "next", prerelease: true }],
  plugins: [
    [
      "@semantic-release/commit-analyzer",
      {
        preset: "angular",
        // Custom rules are checked first and the defaults only when none matches, so the
        // breaking rule is repeated here: otherwise a refactor or hotfix with a
        // `BREAKING CHANGE:` footer would only be a patch.
        releaseRules: [
          { breaking: true, release: "major" },
          { type: "hotfix", release: "patch" },
          { type: "refactor", release: "patch" },
        ],
      },
    ],
    "@semantic-release/release-notes-generator",
    "@semantic-release/github",
    [
      "@semantic-release/changelog",
      {
        changelogFile: "CHANGELOG.md",
      },
    ],
    [
      "@semantic-release/git",
      {
        assets: ["CHANGELOG.md", "package.json"],
        message:
          "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}",
      },
    ],
  ],
};
