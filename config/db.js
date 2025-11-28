const mysql = require('mysql2/promise');

async function initDb() {
  try {
    const connection = await mysql.createConnection({
      host: 'sql8.freesqldatabase.com',
      user: 'sql8809783',
      password: 'QYHIdBK6ll',
      database: 'sql8809783',
      port: 3306
    });
    console.log('DB connected successfully!');
    return connection;
  } catch (error) {
    console.error('DB connection failed:', error);
    process.exit(1); // stop server if DB fails
  }
}

initDb();
