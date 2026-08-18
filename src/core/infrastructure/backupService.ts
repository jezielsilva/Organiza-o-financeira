/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Módulo: core
 * Camada: infrastructure
 *
 * Reexporta o serviço de backup para uso dentro dos módulos.
 * O arquivo de implementação real está em src/services/backupService.ts.
 */

export { importarBackupDoApp, exportarBackupDoApp, validarBackupSchema } from "../../services/backupService";
