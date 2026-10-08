// Compatibility entrypoint; the transportable skill owns media generation.
const { runMediaCli } = await import('../fly/gateway/workspace/skills/goatlab/scripts/generate-media-pack.mjs');
await runMediaCli();
