const bcrypt = require('bcryptjs');

const password = 'Admin@SecurePass123';

bcrypt.hash(password, 10).then(hash => {
  console.log('Generated hash:', hash);
  
  // Immediately test it
  bcrypt.compare(password, hash).then(match => {
    console.log('Immediate match:', match);
  });
});
