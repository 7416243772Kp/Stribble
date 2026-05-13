const fs = require('fs');
let c = fs.readFileSync('public/admin.html', 'utf8');
c = c.replace(/<section id="promoters"[\s\S]*?<\/section>/, '');
fs.writeFileSync('public/admin.html', c);
