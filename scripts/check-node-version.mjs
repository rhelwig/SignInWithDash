import process from "node:process";

const minimum = [24, 18, 0];
const actual = process.versions.node.split(".").map(Number);
const sameMajor = actual[0] === minimum[0];
const meetsMinimum =
  actual[1] > minimum[1] ||
  (actual[1] === minimum[1] && actual[2] >= minimum[2]);

if (!sameMajor || !meetsMinimum) {
  console.error(
    `SignInWithDash requires Node >=24.18.0 <25; running ${process.versions.node}. Run "nvm install 24 && nvm use 24" and retry.`,
  );
  process.exit(1);
}
