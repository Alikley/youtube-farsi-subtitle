class AudioProcessor extends AudioWorkletProcessor {
  process(inputs, outputs) {
    // اضافه کردن outputs به پارامترها
    const input = inputs[0];
    const output = outputs[0]; // خروجی رو بگیریم
    if (input && input[0] && output && output[0]) {
      // کپی داده ورودی به خروجی برای ادامه پخش صدا
      output[0].set(input[0]);
      // حالا postMessage
      this.port.postMessage(new Float32Array(input[0]));
    }
    return true;
  }
}

registerProcessor("audio-processor", AudioProcessor);
