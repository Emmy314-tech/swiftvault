import axios from "axios";

try {
  const res = await axios.get(
    "https://client.peyflex.com.ng/api/data/networks/"
  );

  console.log(res.data);

} catch (err) {
  console.log(err.message);
  console.log(err);
}
