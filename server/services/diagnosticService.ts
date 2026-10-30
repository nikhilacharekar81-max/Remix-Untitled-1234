import { randomUUID } from 'crypto';
import { postgresStore, isPostgresEnabled } from '../db/postgresStore.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

const CONFIGURED_LOG_FILE = process.env.DIAGNOSTIC_LOG_FILE
  ? path.resolve(process.env.DIAGNOSTIC_LOG_FILE)
  : path.join(os.tmpdir(), 'wph-runtime-diagnostics.log');

export type DiagnosticSeverity = 'info' | 'warning' | 'critical' | 'security' | 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL' | 'SECURITY';
export type DiagnosticOutcome = 'SUCCESS' | 'INTERCEPTED' | 'FAILED';

export interface DiagnosticLogEntry {
  id: string;
  timestamp: string;
  severity: string;
  service: string;
  function_name: string;
  implementation: string | null;
  operation: string;
  request_id?: string | null;
  outcome: string;
  error_message: string | null;
  details: any;
}

class DiagnosticService {
  private queue: DiagnosticLogEntry[] = [];
  private inMemoryLogs: DiagnosticLogEntry[] = [];
  private readonly MAX_QUEUE_SIZE = 100;
  private readonly MAX_IN_MEMORY_SIZE = 1000;

  async log(
    severity: DiagnosticSeverity,
    service: string,
    functionName: string,
    implementation: string | null,
    operation: string,
    outcome: DiagnosticOutcome | string,
    details: any,
    error: any = null,
    requestId: string | null = null
  ) {
    const entry: DiagnosticLogEntry = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      severity: String(severity).toLowerCase(),
      service,
      function_name: functionName,
      implementation,
      operation,
      request_id: requestId,
      outcome: String(outcome).toUpperCase(),
      error_message: error ? String(error?.message || error) : null,
      details: details || {}
    };

    this.inMemoryLogs.unshift(entry);
    if (this.inMemoryLogs.length > this.MAX_IN_MEMORY_SIZE) {
      this.inMemoryLogs.pop();
    }

    if (this.queue.length < this.MAX_QUEUE_SIZE) {
      this.queue.push(entry);
    }
    this.flush();
    if (process.env.DIAGNOSTIC_LOG_FILE) {
      this.exportToFile(entry);
    }
    return entry;
  }

  public getInMemoryLogs(filter?: any): DiagnosticLogEntry[] {
    let result = [...this.inMemoryLogs];
    if (!filter) return result;
    if (filter.severity) {
      const s = String(filter.severity).toLowerCase();
      result = result.filter(e => e.severity === s);
    }
    if (filter.service) {
      result = result.filter(e => e.service === filter.service);
    }
    if (filter.operation) {
      result = result.filter(e => e.operation === filter.operation);
    }
    if (filter.requestId) {
      result = result.filter(e => e.request_id === filter.requestId);
    }
    if (filter.outcome) {
      const o = String(filter.outcome).toUpperCase();
      result = result.filter(e => e.outcome === o);
    }
    return result;
  }

  private isFlushing = false;

  private flush() {
    if (!isPostgresEnabled() || this.queue.length === 0 || this.isFlushing) return;
    this.isFlushing = true;

    setImmediate(() => {
      postgresStore.runOutsideTransaction(async () => {
        try {
          while (this.queue.length > 0) {
            const entriesToFlush = [...this.queue];
            this.queue = [];
            await postgresStore.executeInTransaction(async (client: any) => {
              for (const entry of entriesToFlush) {
                await client.query(
                  `INSERT INTO runtime_diagnostic_logs (id, timestamp, severity, service, function_name, implementation, operation, request_id, outcome, error_message, details)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                   ON CONFLICT (id) DO NOTHING`,
                  [
                    entry.id, entry.timestamp, entry.severity, entry.service, entry.function_name,
                    entry.implementation, entry.operation, entry.request_id || null, entry.outcome, entry.error_message, JSON.stringify(entry.details)
                  ]
                );
              }
            });
          }
        } catch (err) {
          console.error('[DiagnosticService] Postgres flush failed:', err);
        } finally {
          this.isFlushing = false;
        }
      });
    });
  }

  private exportToFile(entry: any) {
    try {
      const logLine = JSON.stringify(entry) + '\n';
      fs.promises.appendFile(CONFIGURED_LOG_FILE, logLine, 'utf8').catch((err) => {
        console.error('Failed to write to diagnostic log file:', err);
      });
    } catch (err) {
      console.error('Failed to write to diagnostic log file:', err);
    }
  }
}

export const diagnosticService = new DiagnosticService();
