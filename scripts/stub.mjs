const command = process.argv[2] ?? "unspecified";
process.stdout.write(
  `${JSON.stringify({ status: "stub", command, todo: "later-wave" })}\n`,
);
