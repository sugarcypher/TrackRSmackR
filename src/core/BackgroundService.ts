import { BouncerCore } from './BouncerCore.js';
import { enforceLocalOnlyRuntime } from './LocalOnlyGuard.js';

enforceLocalOnlyRuntime();
const bouncer = new BouncerCore();
void bouncer.start();
