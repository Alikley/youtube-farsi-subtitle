// import { initDatabase } from "./database.js";
// import { translateWithQuota } from "./translator.js";

// (async () => {
//   await initDatabase();

//   // userId فرضی
//   const userId = "test_user_01";

//   // تست ترجمه کوتاه
//   const result = await translateWithQuota({
//     userId,
//     text: "Hello world, this is a test translation.",
//     durationSeconds: 120, // فرضاً ۲ دقیقه مصرف
//   });

//   console.log("✅ Translation result:");
//   console.log(result);

//   // اجرای دوباره برای جمع شدن مصرف
//   const result2 = await translateWithQuota({
//     userId,
//     text: "Another short translation test.",
//     durationSeconds: 7200, // اضافه کن تا از حد بگذره
//   });

//   console.log("✅ Second call:");
//   console.log(result2);
// })();
