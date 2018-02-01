FROM node:carbon

# Create app directory
WORKDIR /nomad-stats

# Install app dependencies
COPY package*.json ./

RUN npm install

# Bundle app source
COPY . .

EXPOSE 80
CMD [ "npm", "start" ]
