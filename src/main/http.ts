import https from 'node:https';

export class HttpError extends Error {
  constructor(public status: number, public body: string) {
    super(`HTTP ${status}`);
  }
}

/**
 * 127.0.0.1 üzerindeki Riot servislerine (LCU ve Live Client Data) GET isteği.
 * Bu servisler Riot'un kendi imzaladığı sertifikayı kullandığı için sertifika
 * doğrulaması yalnızca yerel adres için kapatılıyor.
 */
export function localGet<T>(port: number, path: string, token?: string, timeoutMs = 2500): Promise<T> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) headers.Authorization = 'Basic ' + Buffer.from(`riot:${token}`).toString('base64');
    const req = https.request(
      { host: '127.0.0.1', port, path, method: 'GET', headers, rejectUnauthorized: false, timeout: timeoutMs },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          const status = res.statusCode ?? 0;
          if (status < 200 || status >= 300) return reject(new HttpError(status, data));
          try {
            resolve(JSON.parse(data) as T);
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end();
  });
}
