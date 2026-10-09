import { transact } from '../fly/gateway/workspace/skills/goatlab/scripts/agnes-state.mjs';
import { recordOperations } from './record-r2-operations.mjs';
try {
  const result = await transact('health', {});
  await recordOperations(result.operations);
  console.log('agnes: estado privado verificado');
} catch (error) {
  await recordOperations(error.operations);
  console.error('agnes: preflight: ' + String(error.message).replace(/https?:\/\/\S+/g, '[endpoint]').slice(0, 500));
  process.exitCode = 2;
}
