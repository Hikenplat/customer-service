import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import path from 'path';
import fs from 'fs';

// Database schema type
interface DatabaseSchema {
  admin_users: any[];
  disputes: any[];
  email_templates: any[];
  email_threads: any[];
  email_messages: any[];
  chat_sessions: any[];
  chat_messages: any[];
  file_uploads: any[];
  notifications: any[];
}

// Database path resolution: prefer explicit env, then well-known src path, then local directory
function resolveDbPath(): string {
  if (process.env.DB_PATH) return process.env.DB_PATH;
  const srcPath = path.resolve(process.cwd(), 'src', 'database', 'dispute-portal.json');
  if (fs.existsSync(srcPath)) return srcPath;
  return path.join(__dirname, 'dispute-portal.json');
}

const dbPath = resolveDbPath();
const dbDir = path.dirname(dbPath);

// Ensure database directory exists
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Initialize lowdb
const adapter = new JSONFile<DatabaseSchema>(dbPath);
const db = new Low<DatabaseSchema>(adapter, {
  admin_users: [],
  disputes: [],
  email_templates: [],
  email_threads: [],
  email_messages: [],
  chat_sessions: [],
  chat_messages: [],
  file_uploads: [],
  notifications: []
});

// Helper class to mimic SQLite API
class DB {
  async read() {
    await db.read();
  }

  async write() {
    await db.write();
  }

  prepare(query: string) {
    return {
      get(...params: any[]): any {
        // Parse simple SELECT queries
        const match = query.match(/SELECT \* FROM (\w+) WHERE (.+)/i);
        if (match) {
          const table = match[1] as keyof DatabaseSchema;
          const whereClause = match[2];
          
          const item = (db.data[table] as any[]).find((row: any) => {
            if (whereClause.includes('=')) {
              const parts = whereClause.split('=');
              const field = parts[0].trim();
              const value = params[0];
              return row[field] === value;
            }
            return false;
          });
          return item;
        }

        // COUNT queries
        const countMatch = query.match(/SELECT COUNT\(\*\) as (\w+) FROM (\w+)(?: WHERE (.+))?/i);
        if (countMatch) {
          const countField = countMatch[1];
          const table = countMatch[2] as keyof DatabaseSchema;
          const whereClause = countMatch[3];
          
          let items = db.data[table] as any[];
          
          if (whereClause) {
            items = items.filter((row: any) => {
              if (whereClause.includes('=')) {
                const parts = whereClause.split('=');
                const field = parts[0].trim();
                const value = params[0]?.replace(/["']/g, '') || whereClause.split('=')[1].trim().replace(/["']/g, '');
                return row[field] == value;
              }
              if (whereClause.includes('DATE(')) {
                return true; // Simplified date handling
              }
              return true;
            });
          }
          
          return { [countField]: items.length };
        }

        return null;
      },

      all(...params: any[]): any[] {
        const match = query.match(/SELECT \* FROM (\w+)(?: WHERE (.+))?(?: ORDER BY (.+))?(?: LIMIT (\d+))?(?: OFFSET (\d+))?/i);
        if (match) {
          const table = match[1] as keyof DatabaseSchema;
          let items = [...(db.data[table] as any[])];
          
          // Apply WHERE clause
          if (match[2]) {
            const whereClause = match[2];
            items = items.filter((row: any) => {
              let paramIndex = 0;
              let clause = whereClause;
              
              // Simple AND clause handling
              const conditions = clause.split(' AND ');
              return conditions.every(condition => {
                if (condition.includes('LIKE')) {
                  const field = condition.split(' LIKE')[0].trim();
                  const value = params[paramIndex++];
                  if (value) {
                    const searchTerm = value.replace(/%/g, '').toLowerCase();
                    return row[field]?.toLowerCase().includes(searchTerm);
                  }
                } else if (condition.includes('>=')) {
                  const field = condition.split('>=')[0].trim();
                  return row[field] >= params[paramIndex++];
                } else if (condition.includes('<=')) {
                  const field = condition.split('<=')[0].trim();
                  return row[field] <= params[paramIndex++];
                } else if (condition.includes('=')) {
                  const field = condition.split('=')[0].trim();
                  return row[field] == params[paramIndex++];
                }
                return true;
              });
            });
          }
          
          // Apply ORDER BY
          if (match[3]) {
            const orderBy = match[3].trim();
            const [field, direction] = orderBy.split(' ');
            items.sort((a, b) => {
              const aVal = a[field];
              const bVal = b[field];
              if (direction?.toUpperCase() === 'DESC') {
                return bVal > aVal ? 1 : -1;
              }
              return aVal > bVal ? 1 : -1;
            });
          }
          
          // Apply LIMIT and OFFSET
          const limit = match[4] ? parseInt(match[4]) : undefined;
          const offset = match[5] ? parseInt(match[5]) : 0;
          
          if (limit !== undefined) {
            items = items.slice(offset, offset + limit);
          }
          
          return items;
        }
        return [];
      },

      run(...params: any[]): any {
        // INSERT queries
        const insertMatch = query.match(/INSERT INTO (\w+) \((.+)\) VALUES \((.+)\)/i);
        if (insertMatch) {
          const table = insertMatch[1] as keyof DatabaseSchema;
          const fields = insertMatch[2].split(',').map(f => f.trim());
          const values = params;
          
          const newRow: any = {};
          fields.forEach((field, i) => {
            newRow[field] = values[i];
          });
          
          (db.data[table] as any[]).push(newRow);
          db.write();
          return { changes: 1 };
        }

        // UPDATE queries
        const updateMatch = query.match(/UPDATE (\w+) SET (.+) WHERE (.+)/i);
        if (updateMatch) {
          const table = updateMatch[1] as keyof DatabaseSchema;
          const setClause = updateMatch[2];
          const whereClause = updateMatch[3];
          
          const items = db.data[table] as any[];
          const whereField = whereClause.split('=')[0].trim();
          const whereValue = params[params.length - 1];
          
          const item = items.find((row: any) => row[whereField] === whereValue);
          if (item) {
            const sets = setClause.split(',');
            let paramIndex = 0;
            sets.forEach(set => {
              const field = set.split('=')[0].trim();
              if (set.includes('CURRENT_TIMESTAMP')) {
                item[field] = new Date().toISOString();
              } else {
                item[field] = params[paramIndex++];
              }
            });
            db.write();
            return { changes: 1 };
          }
        }

        // DELETE queries
        const deleteMatch = query.match(/DELETE FROM (\w+) WHERE (.+)/i);
        if (deleteMatch) {
          const table = deleteMatch[1] as keyof DatabaseSchema;
          const whereClause = deleteMatch[2];
          const field = whereClause.split('=')[0].trim();
          const value = params[0];
          
          const items = db.data[table] as any[];
          const index = items.findIndex((row: any) => row[field] === value);
          if (index !== -1) {
            items.splice(index, 1);
            db.write();
            return { changes: 1 };
          }
        }

        return { changes: 0 };
      }
    };
  }
}

const dbInstance = new DB();

// Get database instance
export async function getDb() {
  await db.read();
  return db;
}

// Initialize database (just ensure it's read)
export async function initializeDatabase(): Promise<void> {
  await db.read();
  console.log('✅ Database initialized successfully (lowdb JSON)');
  console.log('🗂️  DB file:', dbPath);
}

export default dbInstance;
