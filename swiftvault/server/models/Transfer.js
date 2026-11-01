import mongoose from "mongoose";

const transferSchema = new mongoose.Schema(
{
    sender:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User",
        required:true
    },

    receiver:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User",
        required:true
    },

    amount:{
        type:Number,
        required:true
    },

    narration:{
        type:String,
        default:"Wallet Transfer"
    },

    reference:{
        type:String,
        unique:true,
        required:true
    },

    status:{
        type:String,
        enum:["success","failed"],
        default:"success"
    }
},
{
    timestamps:true
});

export default mongoose.model("Transfer",transferSchema);
