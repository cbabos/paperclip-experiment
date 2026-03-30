const { createApp } = require('./server');

const port = Number(process.env.PORT || 3001);
const { server } = createApp();

server.listen(port, () => {
  process.stdout.write(`API listening on :${port}\n`);
});
