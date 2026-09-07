import { provideLucideConfig } from '@lucide/angular';

/**
 * Wrapper mínimo sobre lucide-angular para no repetir el import
 * `from '@lucide/angular'` (y su nombre completo `LucideXxx`) en cada
 * componente. Cada ícono usado en la app se re-exporta acá una vez, con un
 * alias corto `IconXxx`.
 *
 * Los componentes de ícono son standalone y tree-shakeable: solo entra al
 * bundle lo que efectivamente se importa desde este archivo.
 */
export {
  LucideBookOpen as IconBookOpen,
  LucideCheck as IconCheck,
  LucideChevronDown as IconChevronDown,
  LucideGraduationCap as IconGraduationCap,
  LucideLayoutDashboard as IconLayoutDashboard,
  LucideLoaderCircle as IconLoaderCircle,
  LucideLock as IconLock,
  LucideMail as IconMail,
  LucideUserPlus as IconUserPlus,
  LucideUsers as IconUsers,
  LucideX as IconX,
} from '@lucide/angular';

/** Tamaño y grosor de trazo por defecto para todos los íconos de la app. */
export function provideAppIcons() {
  return provideLucideConfig({ size: 20, strokeWidth: 1.75 });
}
