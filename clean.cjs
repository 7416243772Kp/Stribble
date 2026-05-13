const fs = require('fs');
let c = fs.readFileSync('public/admin.html', 'utf8');
c = c.replace(/<h2>Promoters<\/h2>[\s\S]*?<\/div>\s+<\/div>/g, '');
fs.writeFileSync('public/admin.html', c);
