import { transact } from '../../scripts/agnes-state.mjs';
import { recordOperations } from '../../scripts/record-r2-operations.mjs';
try {
  const result = await transact('health', {});
  await recordOperations(result.operations);
  console.log('agnes: estado privado verificado');
} catch (error) {
  await recordOperations(error.operations);
  console.error('agnes: preflight: ' + String(error.message).replace(/https?:\/\/\S+/g, '[endpoint]').slice(0, 500));
  process.exitCode = 2;
}
