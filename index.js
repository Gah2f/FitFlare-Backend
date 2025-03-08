const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();
const { ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.SECRET_KEY);
const jwt = require('jsonwebtoken');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

const verifyJWT = (req, res, next) => {
  const autorization = req.headers.authorization;
  if(!autorization) {
    return res.status(401).send({message: 'Invalid Autorization'});
  }

  const token = autorization?.split(' ')[1];
  jwt.verify(token, process.env.JWT_SECRET_KEY, (err, decoded)=>{
    if(err) {
    return res.status(403).send({message: 'You do not have a VIP pass!'});
    }
    req.decoded =decoded;
    next();
  })
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@fitness.ob62o.mongodb.net/?retryWrites=true&w=majority&appName=Fitness`;

   let client;
   let database;
   let classesConnection;
   let userConnection ;
   let cartConnection;
   let paymentConnection;
   let enrolledConnection;
   let appliedConnection ;



// Function to connect to MongoDB
async function connectDB() {
  try {
     client = new MongoClient(uri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      }
    });

    await client.connect();
  database = client.db("Fitness");
  classesConnection = database.collection("classes");
  userConnection = database.collection("users");
  cartConnection = database.collection("cart");
  paymentConnection = database.collection("payments");
  enrolledConnection = database.collection("enrolled");
  appliedConnection = database.collection("applied");

    console.log("✅ Connected to MongoDB!");
  } catch (error) {
    console.error("MongoDB connection error:", error);
  }
}

// Connect to MongoDB when the server starts
connectDB();

// FOR JWT tokens 
app.post('/api/settoken', (req,res)=>{
  const user = req.body;
  const token = jwt.sign(user, process.env.JWT_SECRET_KEY, {
    expiresIn: '1d',
  });
  res.send({token});
})

const verifyAdmin =  async (req, res, next)=>{
  const AdminEmail= req.decoded.email;
  const query = {email: AdminEmail};
  const user = await userConnection.findOne(query);
  if (user.role !== 'admin') {
    next();
  } else {
    return res.status(403).send({message: 'You are not allowed in here! This is not your VIP pass!'});
  }
 }

 const verifyInstructor  = async (req,res, next)=>{
  const InstructorEmail = req.decoded.email;
  const query = {email: InstructorEmail};
  const user =  await userConnection.findOne(query);
  if (user.role === 'instructor') {
    next();
  } else {
    return res.status(403).send({message: 'You are not the instructor for this class!'});
  }
 }

// API routes for class collection [line 57-141] 
app.post('/new-class', verifyJWT, verifyInstructor, async (req, res) => {
    const newClass = req.body;
    const result = await classesConnection.insertOne(newClass);
    res.status(201).json(result);
});

app.get('/', (req, res) => {
  res.send('Hello Folks, I am a server');
});

app.get('/classes',  async (req, res) => {
  const query = {status : 'approved'};
  const result = await classesConnection.find(query).toArray();
  res.send(result);
});

app.get('/classes/:email',   verifyJWT, verifyInstructor, async (req, res) => {
  const instructorEmail = req.params.email;
  const query = {email : instructorEmail};
  const result = await classesConnection.findOne(query);
  res.send(result);

});

app.get('/classesmanagement', async (req, res)=> {
  const result = await classesConnection.find().toArray();
  res.send(result);
});

app.patch ('/classesupdated/:id', async (req,res)=> {
  const id = req.params.id;
  const status = req.body.status;
  const reason = req.body.reason;
  const filter = {_id: new ObjectId(id)};
  const options = {upsert : false};

  const updatedDOC = {$set: 
    {status: status, reason: reason}
    ,};
  const result = await classesConnection.updateOne(filter, updatedDOC, options);
  res.send(result);
})

app.get('/approvedclass', async (req, res)=>{
  const query = {status : 'approved'};
  const result = await classesConnection.find(query).toArray();
  res.send(result);
})

app.get('/singleclass/:id', async (req,res)=>{
  const id = req.params.id;
  const query = {_id :new ObjectId(id)};
  const result = await classesConnection.find(query).toArray();
  res.send(result);
});

app.put('/updateAll/:id', verifyJWT, verifyInstructor,  async (req, res)=>{
  const id = req.params.id;
  const updatedClass = req.body;
  const filter = {_id: new ObjectId(id)};
  const options = {upsert : true};

  const updateDOC = {
    $set: {
      name: updatedClass.name,
      image: updatedClass.image,
      availableSeats: parseInt(updatedClass.availableSeats),
      price: updatedClass.price,
      videoLink: updatedClass.videoLink,
      description: updatedClass.description,
      instructorName: updatedClass.instructorName,
      instructorEmail: updatedClass.instructorEmail,
      status: updatedClass.status,
      submitted: updatedClass.submitted,
      totalEnrolled: updatedClass.totalEnrolled,
      reason: updatedClass.reason,
    }
  }
  const result = await classesConnection.updateOne(filter, updateDOC, options);
  res.send(result);
})


// API routes for cart collection [line 141-170]
app.post("/addtocart", verifyJWT, async (req,res)=>{
  const newCart = req.body;
  const result =await cartConnection.insertOne(newCart);
  res.send(result);
});

app.get('/cartcollections/:id', verifyJWT, async (req,res)=>{
  const id = req.params.id;
  const query = {_id : new ObjectId(id)};
  const result =await cartConnection.find(query).toArray();
  res.send(result);
})

app.get('/cart/:email', verifyJWT, async (req, res) =>{
  const cartEmail = req.params.email;
  const query ={email : cartEmail};
  const projection = {classID : 1};
  const carts = await cartConnection.find(query, {projection: projection}).toArray();
  const classIDs = carts.map((cart) =>new ObjectId(cart.classID));
  const query2 = {_id: {$in: classIDs}};
  const result = await classesConnection.find(query2).toArray();
  res.send(result);
});

app.delete('/deletecart/:id', verifyJWT, async (req,res)=>{
  const id = req.params.id;
  const query = {_id : new ObjectId(id)};
  const result =await cartConnection.deleteOne(query);
  res.send(result);
})

// API Route for Payment Connection [line 173-241]
app.post('/payment', async (req,res)=>{
  const newPayment = req.body;
  const result= await paymentConnection.insertOne(newPayment);
  res.send(result);
} );

app.get('/payment/:id', async (req,res)=>{
  const id = req.params.id;
  const query ={_id : new ObjectId(id)};
  const result = await paymentConnection.find(query).toArray();
  res.send(result);
});

app.get('/payment/:email', async (req,res)=>{
  const userEmail = req.params.email;
  const query = { email : userEmail};
  const result = await paymentConnection.findOne(query).sort({date: -1});
  res.send(result);
})

app.get('/paymentlength/:email', async (req,res)=>{
  const userEmail = req.params.email;
  const query = {email : userEmail};
  const total = await paymentConnection.countDocuments(query);
  res.send({total});
})

app.post('/create-payment-intent', async (req,res)=>{
  const {price} = req.body;
  const amount = parseInt(price)*100;
  const paymentIntent = await stripe.paymentIntents.create({
    amount: amount,
    currency: "usd",
    payment_method_types:["card"],
  })
  res.send({clientSecret: paymentIntent.client_secret});
})

app.post('/paymentInfo', verifyJWT,  async (req,res)=>{
  const paymentInfo =req.body;
  const classesID = paymentInfo.classID;
  const userEmail = paymentInfo.userEmail;
  const singleClassID = req.query.singleClassID;
  let query;
  if (singleClassID) {
    query = {classID: singleClassID, userEmail: userEmail};
  } else {
    query = {classID : {$in: classesID}}
  } 
  const classesQuery = {_id : {$in: classesID.map((id) => new ObjectId(id))}};
  const classes = await paymentConnection.find(classesQuery).toArray();
  const newEnrollmentdata = {
    userEmail: userEmail,
    classID: singleClassID.map((id)=> new ObjectId(id)),
    transactionID: paymentInfo.transactionID,
  }

  const updatedDOC = {
    $set: {
      totalEnrolled: classes.reduce((total, current)=> total + current.totalEnrolled, 0) + 1 || 0,
      availableSeats: classes.reduce((total, current)=> total + current.availableSeats, 0) - 1 || 0,
    }
  }
  const updatedResult = await classesConnection.updateMany(classesQuery, updatedDOC, {upsert : true});
  const updatedEnrollment = await enrolledConnection.insertOne(newEnrollmentdata);
  const deletedResult = await cartConnection.deleteMany(query);
  const paymentResult = await paymentConnection.insertOne(paymentInfo);
  res.send({updatedResult, updatedEnrollment, deletedResult, paymentResult});
})

app.get('/popularclasses', async (req,res)=> {
  const result = await classesConnection.find().sort({totalEnrolled: -1}).limit(6).toArray();
  res.send(result);
});

app.get('/popularinstructors', async (req,res)=>{
  const pipeline = [
   {
    $group: {
      _id: "$instructorEmail",
      totalEnrolled: {$sum: "$totalEnrolled"}, 
    },
   },
   {
    $lookup: {
      from: "users",
      localField: "_id",
      foreignField: "email",
      as: "instructor"
    },
   }, 
   {
    $project: {
      _id: 0,
      instructor: {
        $arrayElemAt: ["$instructor", 0]
      },
      totalEnrolled: 1,
    }
   },
   {
    $sort: {totalEnrolled: -1},
   },
   {
    $limit: 6,
   }
  

  ];
  const result = await classesConnection.aggregate(pipeline).toArray();
  res.send(result);
})

// For admin status

app.get('/adminstatus', verifyJWT, verifyAdmin, async (req,res)=>{
  const approvedClases = ((await classesConnection.find({status: 'approved'}).toArray())).length;
  const pendindClasses = ((await classesConnection.find({status: 'pending'}).toArray())).length;
  const instructors = ((await userConnection.find({role: 'instructor'}).toArray())).length;
  const totalClasses = (await classesConnection.find().toArray()).length;
  const totalEnrolled = (await enrolledConnection.find().toArray()).length;
  const result = {approvedClases, pendindClasses, instructors, totalClasses, totalEnrolled};
  res.send(result);
})

app.get('/instructors', async (req,res)=>{
  const result = await userConnection.find({role: 'instructor'}).toArray();
  res.send(result);
})

app.get('/enrolledclasses/:email', verifyJWT, async (req, res)=>{
  const userEmail = req.params.email;
  const query = {email : userEmail};
  const pipeline=[
    {
      $match: query
    }, 
    {
      $lookup: {
        from: "classes",
        localField: "classesID",
        foreignField: "_id",
        as : "class"
      }
    }, 
    {
      $unwind: "$classes",
    },
    {
      $lookup: {
        from: "users",
        localField: "classes.instructorEmail",
        foreignField: "email",
        as : "instructor"
      }
    }, 
    {
      $project: {
        _id: 0,
        instructor: {
          $arrayElemAt: ["$instructor", 0 ]
        },
        classes: 1,
      }
    }
  ]
  const result = await enrolledConnection.aggregate(pipeline).toArray();
  res.send(result);

})

//  API Route for Applied Connection [line 345-354] 
app.post('/asinstructor', async (req,res)=>{
  const data = req.body;
  const result = await appliedConnection.insertOne(data);
  res.send(result);
})
app.get('/appliedinstructors/:email', async (req,res)=>{
  const email = req.params.email;
  const result = await appliedConnection.find({email});
  res.send(result);
})

//  API Route for User Connection [line]

app.post('/newUser', async (req,res)=>{
  const newUser = req.body;
  const result = await userConnection.insertOne(newUser);
  res.send(result);
})

app.get('/user', async (req,res)=>{
  const result = await userConnection.find().toArray();
  res.send(result);
})

app.get('/user/:id', async (req,res)=>{
  const id= req.params.id;
  const query = {_id: new ObjectId(id)};
  const result = await userConnection.findOne(query);
  res.send(result);
})

app.get('/user/:email', verifyJWT, async (req,res)=>{
  const userEmail= req.params.email;
  const query= {email : userEmail};
  const result = await userConnection.findOne(query);
  res.send(result);
})

app.delete('/deleteuser/:id', verifyJWT, verifyAdmin, async (req,res)=>{
  const id=req.params.id;
  const query = {_id: new ObjectId(id)};
  const result = await userConnection.deleteOne(query);
  res.send(result);
})

app.put('/updateusers/:id', verifyJWT, verifyAdmin, async (req,res)=>{
  const id = req.params.id;
  const filter = {_id : new ObjectId(id)};
  const updatedUser = req.body;
  const options = {upsert : true};
  const updatedDOC = {
    $set : {
      name: updatedUser.name,
      email: updatedUser.email,
      role: updatedUser.option,
      address: updatedUser.address,
      gender: updatedUser.gender,
      phone: updatedUser.phone,
      about: updatedUser.about,
      photoUrl: updatedUser.photoUrl,
      skills: updatedUser.skills ? updatedUser.skills : null,
    }
  }
  const result = await userConnection.updateMany(filter,updatedDOC,options);
  res.send(result);
})

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});

