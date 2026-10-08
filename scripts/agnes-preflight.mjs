import { transact } from '../fly/gateway/workspace/skills/goatlab/scripts/agnes-state.mjs';
import { recordOperations } from './record-r2-operations.mjs';
try {
  const result = await transact('health', {});
  await recordOperations(result.operations);
  console.log('agnes: estado privado verificado');
} catch (error) {
  await recordOperations(error.operations);
  console.error('agnes: estado privado no disponible; nuevas solicitudes cerradas');
  process.exitCode = 2;
}
