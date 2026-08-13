const path = require('path');
const fs = require('fs');

async function testWhisperPipeline() {
  try {
    require('onnxruntime-node');
    const { pipeline, env } = await import('@huggingface/transformers');
    env.useFSCache = true;
    env.allowLocalModels = true;
    
    console.log('Loading Whisper tiny.en pipeline...');
    const transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', {
      dtype: 'fp32',
      device: 'cpu'
    });
    console.log('Whisper pipeline loaded successfully!');

    // Create 1 second of silence (16000 float32 zeroes)
    const dummyAudio = new Float32Array(16000);
    const start = Date.now();
    const result = await transcriber(dummyAudio);
    console.log(`Inference finished in ${Date.now() - start}ms:`, result);
  } catch (err) {
    console.error('Error running Whisper:', err);
  }
}

testWhisperPipeline();
