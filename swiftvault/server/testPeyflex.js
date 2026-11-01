import dotenv from "dotenv";
import axios from "axios";
dotenv.config();

const BASE_URL = process.env.PEYFLEX_BASE_URL?.replace(/\/$/, "");
const TOKEN = process.env.PEYFLEX_API_TOKEN;

const testData = async () => {
  try {
    const headers = {
      headers: {
        Authorization: `Token ${TOKEN}`,
        "Content-Type": "application/json"
      }
    };

    // Let's grab plans for MTN Data Share using its exact identifier
    console.log("Fetching plans for mtn_data_share...");
    const planRes = await axios.get(`${BASE_URL}/api/data/plans/?network=mtn_data_share`, headers);
    console.log("\n✅ MTN Data Plans Structure:");
    console.log(JSON.stringify(planRes.data, null, 2));

  } catch (err) {
    console.error("❌ Error:", err.response?.data || err.message);
  }
};

testData();

