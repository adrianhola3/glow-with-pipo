/**
 * cloud-backup.mjs - Glow with Pipo ERP
 * -----------------------------------------------------------------------------
 * Extrae todas las tablas relacionales de Supabase PostgreSQL y las consolida
 * en un único archivo JSON estructurado y versionado en GitHub.
 * 
 * Se ejecuta automáticamente vía GitHub Actions todas las noches a las 05:00 UTC (00:00 Perú).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const BACKUPS_DIR = path.join(REPO_ROOT, 'backups');
const HISTORY_DIR = path.join(BACKUPS_DIR, 'history');
const MAX_HISTORY_DAYS = 30;

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://fpahqojoqjrrthlwland.supabase.co';
// Si existe SUPABASE_SERVICE_ROLE_KEY en GitHub Secrets se usa directamente (bypasea RLS para backup)
// De lo contrario se usa la publishable/anon key con credenciales de usuario
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'sb_publishable_olRnMcbKMUDGHcnCfcB0tg_fQsQob4W';

const client = createClient(SUPABASE_URL, SUPABASE_KEY);

const TABLES = [
  'suppliers',
  'products',
  'product_variants',
  'supplies',
  'combos',
  'combo_items',
  'restocks',
  'restock_items',
  'customers',
  'sales',
  'sale_items',
  'sale_supplies',
  'sale_payments'
];

async function runBackup() {
  console.log(`[${new Date().toISOString()}] Iniciando extracción de Glow with Pipo desde Supabase...`);

  // Si no es service_role, intentar autenticar con credenciales si están disponibles
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_BACKUP_EMAIL && process.env.SUPABASE_BACKUP_PASSWORD) {
    console.log('Autenticando con usuario de respaldo...');
    const { error: authErr } = await client.auth.signInWithPassword({
      email: process.env.SUPABASE_BACKUP_EMAIL,
      password: process.env.SUPABASE_BACKUP_PASSWORD
    });
    if (authErr) {
      console.warn('Aviso: Fallo de login en Supabase:', authErr.message);
    }
  }

  const databaseDump = {
    exported_at: new Date().toISOString(),
    project_url: SUPABASE_URL,
    tables: {}
  };

  let totalRecords = 0;
  let tableErrors = [];
  for (const table of TABLES) {
    try {
      const { data, error } = await client.from(table).select('*');
      if (error) {
        console.warn(`⚠️ Tabla '${table}': ${error.message} (código ${error.code})`);
        tableErrors.push({ table, error: error.message, code: error.code });
        databaseDump.tables[table] = [];
      } else {
        databaseDump.tables[table] = data || [];
        totalRecords += (data || []).length;
        console.log(`  - ${table}: ${(data || []).length} registros`);
      }
    } catch (e) {
      console.warn(`⚠️ Excepción en tabla '${table}':`, e.message);
      tableErrors.push({ table, error: e.message });
      databaseDump.tables[table] = [];
    }
  }

  if (tableErrors.length > 0 && totalRecords === 0) {
    throw new Error(`Abortando guardado: Fallaron ${tableErrors.length}/${TABLES.length} tablas por permisos o error de red y se obtuvieron 0 registros. Configura SUPABASE_SERVICE_ROLE_KEY en GitHub Secrets para acceso completo.`);
  }

  fs.mkdirSync(HISTORY_DIR, { recursive: true });

  const dateStr = new Date().toISOString().slice(0, 10);
  const formattedJson = JSON.stringify(databaseDump, null, 2);

  // 1. Guardar latest
  const latestPath = path.join(BACKUPS_DIR, 'glow_pipo_latest.json');
  fs.writeFileSync(latestPath, formattedJson, 'utf-8');
  console.log(`✅ Guardado: ${latestPath} (${totalRecords} registros totales)`);

  // 2. Guardar snapshot diario
  const historyPath = path.join(HISTORY_DIR, `glow_pipo_backup_${dateStr}.json`);
  fs.writeFileSync(historyPath, formattedJson, 'utf-8');
  console.log(`✅ Snapshot diario guardado: ${historyPath}`);

  // 3. Poda rotativa de historial (mantener últimos 30 días)
  const files = fs.readdirSync(HISTORY_DIR)
    .filter(f => f.startsWith('glow_pipo_backup_') && f.endsWith('.json'))
    .sort();

  while (files.length > MAX_HISTORY_DAYS) {
    const oldest = files.shift();
    const oldestPath = path.join(HISTORY_DIR, oldest);
    fs.unlinkSync(oldestPath);
    console.log(`🧹 Podado histórico antiguo: ${oldest}`);
  }

  console.log('Respaldo en la nube de Glow with Pipo completado con éxito.');
}

runBackup().catch(err => {
  console.error('❌ Error fatal en cloud-backup:', err);
  process.exit(1);
});
