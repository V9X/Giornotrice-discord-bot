import seq from "sequelize";

interface song {
  title: string;
  length: string;
  published: string;
  views: string;
  thumbnail: string;
  url: string;
  addingUser: string;
  author: {
    name: string;
    url: string;
  };
}

export class musicDB extends seq.Model {
  static prep(sq: seq.Sequelize) {
    this.init(
      {
        serverID: { type: seq.DataTypes.STRING, unique: true, allowNull: false },
        queue: { type: seq.DataTypes.TEXT, allowNull: false, defaultValue: "[]" },
        history: { type: seq.DataTypes.TEXT, allowNull: false, defaultValue: "[]" },
      },
      {
        tableName: "music",
        sequelize: sq,
      }
    );
  }

  static async getData(serverID: string): Promise<{ queue: song[], history: song[] }> {
    let data = await this.findOne({ where: { serverID: serverID } });

    if (!data) { data = await this.create({ serverID: serverID }) }

    let queue: song[] = JSON.parse(data.getDataValue("queue"));
    let history: song[] = JSON.parse(data.getDataValue("history"));

    return {
      queue: queue,
      history: history,
    };
  }

  static async replaceData(serverID: string, queue: song[], history: song[]): Promise<void> {
    await this.update({ queue: JSON.stringify(queue), history: JSON.stringify(history.slice(0, 500)) }, { where: { serverID: serverID } });
  }
}

interface cstate {
  global: {
    [commandName: string]: string;
  }
  guilds: {
    [guildID: string]: {
      [commandName: string]: string;
    }
  }
}

interface presence {
  status: "online" | "idle" | "invisible" | "dnd";
  activities: {
    name: string;
    type: 0 | 1 | 2 | 3 | 4 | 5;
    url: string;
  }[]
}

export class botDB extends seq.Model {
  static prep(sq: seq.Sequelize) {
    this.init(
      {
        type: { type: seq.DataTypes.STRING, unique: true, allowNull: false },
        data: { type: seq.DataTypes.TEXT, allowNull: false, defaultValue: '{"global":{},"guilds":{}}' },
      },
      {
        tableName: "bot",
        sequelize: sq,
      }
    );
  }

  static async getData(type: 'cstate'): Promise<cstate>;
  static async getData(type: 'presence'): Promise<presence>;
  static async getData(type: "cstate" | "presence"): Promise<cstate | presence> {
    let data = await this.findOne({ where: { type: type } });

    if (!data) { data = await this.create({ type: type }) }

    let d = JSON.parse(data.getDataValue("data"));

    return d;
  }

  static async replaceData(type: "cstate" | "presence", data: cstate | presence): Promise<void> {
    await this.update({ data: JSON.stringify(data) }, { where: { type: type } });
  }
}