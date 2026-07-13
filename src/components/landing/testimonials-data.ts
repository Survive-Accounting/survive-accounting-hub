// Student testimonials — self-hosted (migrated off testimonial.to).
// Avatars are downloaded into our own public Supabase bucket `testimonials`.
// Ordered best-first (specific outcomes / most compelling lead). Two entries
// from the source export used Lee's own lee+test@ email (test submissions) and
// are intentionally omitted — add them back if desired.

export type Testimonial = {
  name: string;
  school?: string;
  message: string;
  avatar?: string; // our hosted URL; when absent the widget renders initials
};

const AV = "https://unvxagsledbsdoremqeb.supabase.co/storage/v1/object/public/testimonials/";

export const TESTIMONIALS: Testimonial[] = [
  {
    name: "Nic Ripson",
    school: "Ole Miss",
    message:
      "Survive Accounting helped me better understand the content I needed to learn. My quiz average was a 45% and after using this platform to study I got an 84.5% on my first intermediate exam.",
  },
  {
    name: "Nate K.",
    school: "Ole Miss",
    avatar: `${AV}nate-k.jpg`,
    message:
      "Survive Accounting is the sole reason that I got through both accounting courses at Ole Miss. Lee does an exceptional job breaking every little piece down as much as possible and makes it super easy to follow along. He is very enthusiastic and not only is he a great accounting tutor but he is also a genuinely great guy. If you need assistance in your accounting class I highly recommend Survive Accounting.",
  },
  {
    name: "Cheyenne Kuzma",
    school: "Ole Miss",
    avatar: `${AV}cheyenne-k.jpg`,
    message:
      "This should be changed to “Thrive in Accounting” because you will do more than just survive if you use these resources! If every subject had teachers this passionate about what they taught, we would all be better off for it. I got an A on my first accounting test and no tears were shed in the process of studying. What more can you ask for? It's hard to single out one “best thing about Survive Accounting” but if I have to pick one I'd say the long form videos (followed really closely by the cram videos). If you actually watch the videos, you'll learn more there than you will in a lecture alone — they get to the “meat” of the subject and don't BS with things that don't matter. Anyone who is still on the fence, please know this will be the best school purchase you'll make. You'll simultaneously cut your study time in half and double your knowledge in accounting. Your social life will thank you, your GPA will thank you, and your future self will thank you 😁🥳",
  },
  {
    name: "George L.",
    school: "Ole Miss",
    avatar: `${AV}george-l.jpg`,
    message: "If it weren't for Lee, I wouldn't have made A's in both intro courses.",
  },
  {
    name: "Claire Ficek",
    school: "Ole Miss",
    message:
      "Survive Accounting is literally the only reason that I got through Accounting 201! A bunch of my friends used it and said it was so helpful.",
  },
  {
    name: "Locke D.",
    school: "Ole Miss",
    avatar: `${AV}locke-d.jpg`,
    message:
      "I found out about Lee's exam prep on Survive Accounting through my professor and I don't know what I would have done without it. His videos gave me a huge sense of clarity with what I needed to study for and what the tests would be like. I rarely saw a question I didn't know how to answer on my tests because of it, leading to my test scores increasing exponentially. While accounting concepts can be boring at some points, Lee always finds a way to make the subject interesting. He speaks in a language that college students can understand. You won't find that with most accounting tutors.",
  },
  {
    name: "Tyler K.",
    school: "Ole Miss",
    avatar: `${AV}tyler-k.jpg`,
    message: "Lee's exam prep videos are better than any tutor I've ever had.",
  },
  {
    name: "Lily Perry",
    school: "Ole Miss",
    message:
      "Before this chapter, I wasn't very confident in this topic. I always attended class, but nothing ever fully clicked for me. This is my second semester using Survive Accounting, and after using it again, everything finally started to make sense. The way Lee explains things is so relatable and easy to understand. He breaks complicated concepts down step-by-step and explains not just what to do, but why you're doing it. That made a huge difference for me. I honestly can't thank him enough for all his help. I would recommend Survive Accounting to any of my classmates because it makes difficult material feel manageable, helps you actually understand the content instead of just memorizing it, and builds your confidence going into exams. It's like having someone reteach the class in a way that actually sticks! Thanks Lee!",
  },
  {
    name: "Ryan M.",
    school: "Ole Miss",
    avatar: `${AV}ryan-m.jpg`,
    message: "Lee's videos were a lifesaver. I would've failed without them.",
  },
  {
    name: "Daniel B.",
    school: "Ole Miss",
    avatar: `${AV}daniel-b.jpg`,
    message:
      "Survive Accounting helped with my homework, test preparation, and the overall understanding of accounting. Having the ability to see how Lee went step by step in problems helped me grasp super confusing concepts. He was also very friendly over email and even gave me specific pointers about assignments I emailed to him which was a huge help. If you are going to dedicate time to studying, I would highly recommend using Survive Accounting to optimize your understanding of the material and give yourself a greater chance of receiving a high grade in the class!",
  },
  {
    name: "James L.",
    school: "Ole Miss",
    message: "Feel like I got an A purely because of Lee's videos.",
  },
  {
    name: "Zachary Reilly",
    school: "Ole Miss",
    message:
      "Survive Accounting helped me review and prepare both for a QuickBooks course as well as for Managerial Accounting. Additionally, after a billing mistake on my end, Lee resolved the issue on the very same day. Fantastic service!",
  },
  {
    name: "Brace R.",
    school: "Ole Miss",
    avatar: `${AV}brace-r.jpg`,
    message: "I enjoyed how he broke everything down to very simple terms that weren't necessarily explained in class.",
  },
  {
    name: "Dave H.",
    school: "Ole Miss",
    avatar: `${AV}dave-h.jpg`,
    message:
      "Survive Accounting greatly helped me prepare and learn for my accounting exams. I liked how Lee explained ideas in his own words and used examples that we, as students, could easily relate to. Thanks for the help Lee!",
  },
  {
    name: "John Boyer",
    school: "Ole Miss",
    message:
      "Before my Unit 1 test I was semi confident, but once I started reviewing I realized I had a lot more work to do than I anticipated. Watching the Chapter 12 video on a complete cash flow statement helped me get it down and I now feel like I'll ace that part of the exam.",
  },
  {
    name: "Grace E.",
    school: "Ole Miss",
    message: "Lee's videos helped me grasp concepts that were so foreign to me before.",
  },
  {
    name: "Banks A.",
    school: "Ole Miss",
    message: "Lee's videos were a huge help.",
  },
  {
    name: "Sam C.",
    school: "Ole Miss",
    message: "Lee's material is great — I just didn't start early enough looking at it.",
  },
];
