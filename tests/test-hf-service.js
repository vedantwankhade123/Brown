const { searchHuggingFaceGgufModels, getModelQuantizations } = require('../src/main/huggingface-service');

async function test() {
  console.log('Testing Hugging Face live search for "llama"...');
  const models = await searchHuggingFaceGgufModels('llama', 4);
  console.log('Found', models.length, 'models:');
  models.forEach(m => console.log(' ->', m.id, '| size:', m.size, '| downloads:', m.downloads));

  if (models.length > 0) {
    console.log('\nTesting quantizations for', models[0].id, '...');
    const quants = await getModelQuantizations(models[0].id);
    console.log('Available quantizations:', quants.slice(0, 3));
  }
  console.log('\n✅ Hugging Face Service Test Completed Successfully!');
}

test().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
