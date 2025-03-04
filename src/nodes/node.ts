import bodyParser from "body-parser";
import express from "express";
import { BASE_NODE_PORT } from "../config";
import {Message, NodeState, Value} from "../types";
import {delay} from "../utils";

export async function node(
  nodeId: number, // the ID of the node
  N: number, // total number of nodes in the network
  F: number, // number of faulty nodes in the network
  initialValue: Value, // initial value of the node
  isFaulty: boolean, // true if the node is faulty, false otherwise
  nodesAreReady: () => boolean, // used to know if all nodes are ready to receive requests
  setNodeIsReady: (index: number) => void // this should be called when the node is started and ready to receive requests
) {
  const node = express();
  node.use(express.json());
  node.use(bodyParser.json());

  let state: NodeState = {
    killed: false,
    x: initialValue,
    decided: null,
    k: 1,
  };
  if(!isFaulty)
  {
    state = {
      killed: false,
      x: null,
      decided: null,
      k: null,
    };
  }
  let phase: number = 1;
  let messages: { [key: number]: { [key: number]: Message[] } } = {};

  // this route allows retrieving the current status of the node
  node.get("/status", (req, res) => {
    if(isFaulty)
      res.status(500).send("faulty");
    else
      res.status(200).send("live");
  });

  // this route allows the node to receive messages from other nodes
  node.post("/message", async (req) => {
    const {message} = req.body;
    if(message.phase == phase && message.k == state.k)
    {
      storeMessage(message);
      // attendre 100ms
      delay(100);
      if(state.k !=null && (phase == 1 || phase == 2 ) && getMessagesLen(state.k,phase)>=N-F)
      {
        if(phase==1)
        {
          // If more than n/2 messages have the same value, set x to this value
          const messageCounts: { [key: string]: number } = {};
          getMessages(state.k, phase).forEach((msg) => {
            const value = JSON.stringify(msg.x);
            messageCounts[value] = (messageCounts[value] || 0) + 1;
          });
          for (const [value, count] of Object.entries(messageCounts)) {
            if (count > N / 2) {
              state.x = JSON.parse(value);
              break;
            }else{
              state.x = "?";
            }
          }
          phase = 2;
          const message: Message = {
            phase: 2,
            x: state.x,
            k: state.k || 1,
            nodeId: nodeId
          };
          sendToAll(message);

        }else if(phase == 2)
        {
          //If more than 2f messages have the same value, decide on this value
          const messageCounts: { [key: string]: number } = {};
          getMessages(state.k, phase).forEach((msg) => {
            const value = JSON.stringify(msg.x);
            messageCounts[value] = (messageCounts[value] || 0) + 1;
          });
          for (const [value, count] of Object.entries(messageCounts)) {
            if (count > 2*F) {
              // decide on the value
              state.decided=true;
              state.x = JSON.parse(value);
              break;
            }else if(count >F+1)
            {
                state.x = JSON.parse(value);
            }else
            {
              // set x to a random value (either 0 or 1)
              state.x = Math.random() < 0.5 ? 0 : 1;
            }
            phase = 1;
            state.k++;
          }
        }
      }
    }
  });

  // this route is used to start the consensus algorithm
  node.get("/start", async () => {
    while(!state.killed)
    {
        if(nodesAreReady())
        {
          const message: Message = {
            phase: 1,
            x: state.x,
            k: state.k || 1,
            nodeId: nodeId
          };
          sendToAll(message);
        }
    }
  });

  // this route is used to stop the consensus algorithm
  node.get("/stop", async () => {
    state.killed = true;
  });

  // get the current state of a node
  node.get("/getState", (req, res) => {
    res.send(state);
  });

  // start the server
  const server = node.listen(BASE_NODE_PORT + nodeId, async () => {
    console.log(
      `Node ${nodeId} is listening on port ${BASE_NODE_PORT + nodeId}`
    );

    // the node is ready
    setNodeIsReady(nodeId);
  });

  return server;

  function storeMessage( message:Message): void {
    if(!messages[message.k]) messages[message.k] = {[1]: [], [2]: []}
    // Check if the node ID is not already in the array before adding the message
    const nodeIdExists = messages[message.k][phase].some((msg: Message) => msg.nodeId === message.nodeId);
    if (!nodeIdExists) {
      messages[message.k][phase].push(message);
    }
  }
  function getMessages(k: number, phase: 1 | 2): Message[] {
    return messages[k][phase]
  }

  function getMessagesLen(k: number, phase: 1 | 2): number {
    return messages[k][phase].length
  }

  async function sendToAll(message: Message): Promise<void> {
    for (let i = 0; i < N; i++) {
      if (i !== nodeId) {
        await fetch(`http://localhost:${BASE_NODE_PORT + i}/message`, {
          method: "POST",
          body: JSON.stringify({ message }),
          headers: { "Content-Type": "application/json" },
        });
      }
    }
  }
}

