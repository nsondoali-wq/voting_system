const bcrypt = require('bcrypt');

(async () => {
    try {
        const password = '0977360672'; // your chosen admin password
        const hash = await bcrypt.hash(password, 10);
        console.log('Your bcrypt hash is:', hash);
    } catch (err) {
        console.error(err);
    }
})();
